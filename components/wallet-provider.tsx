"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAddress, stringToHex } from "viem";
import { ARC } from "@/lib/arc/config";
import {
  legacyWalletName,
  safeWalletIcon,
  sortWalletProviders,
} from "@/lib/wallet/provider-order";
import { providerRequestWithTimeout } from "@/lib/wallet/provider-request";
import { setSelectedEthereumProvider } from "@/lib/wallet/selected-provider";

export type InstalledWallet = {
  id: string;
  name: string;
  rdns: string;
  icon: string | null;
};

type WalletContextValue = {
  address: `0x${string}` | null;
  chainId: number | null;
  authenticated: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
  hasProvider: boolean;
  installedWallets: InstalledWallet[];
  activeWalletName: string | null;
  clearError: () => void;
  connect: (walletId: string) => Promise<boolean>;
  ensureProvider: () => Promise<EthereumProvider>;
  switchToArc: () => Promise<void>;
  signMessage: (message: string) => Promise<`0x${string}`>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const SESSION_CACHE_KEY = "duevia.wallet-session";
const CHALLENGE_CACHE_MS = 8 * 60 * 1_000;

type SignInChallenge = {
  challengeId: string;
  message: string;
};

type ChallengeEntry = {
  key: string;
  createdAt: number;
  promise: Promise<SignInChallenge>;
};

function storeCachedSession(
  address: `0x${string}`,
  chainId: number,
) {
  try {
    window.localStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ address, chainId }),
    );
  } catch {
    // Browser storage is an optional speed hint; the server session is authoritative.
  }
}

function clearCachedSession() {
  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Ignore blocked browser storage.
  }
}

function walletError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 4001
  ) {
    return "The wallet request was cancelled.";
  }
  return error instanceof Error ? error.message : "The wallet request failed.";
}

function legacyProviders() {
  const injected = window.ethereum;
  if (!injected) return [];
  const providers = injected.providers?.length
    ? injected.providers
    : [injected];
  return providers.map((provider, index): Eip6963ProviderDetail => {
    const name = legacyWalletName(provider);
    return {
      info: {
        uuid: `legacy-${name.toLowerCase().replaceAll(" ", "-")}-${index}`,
        name,
        icon: "",
        rdns: `legacy.${name.toLowerCase().replaceAll(" ", "-")}`,
      },
      provider,
    };
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>([]);
  const [activeProvider, setActiveProvider] =
    useState<Eip6963ProviderDetail | null>(null);
  const challengeRef = useRef<ChallengeEntry | null>(null);
  const sessionResetRef = useRef<Promise<void> | null>(null);
  const sessionVersionRef = useRef(0);

  const startSessionReset = useCallback(() => {
    const pending = fetch("/api/auth/signout", { method: "POST" })
      .then(() => undefined)
      .catch(() => undefined);
    sessionResetRef.current = pending;
    void pending.then(() => {
      if (sessionResetRef.current === pending) {
        sessionResetRef.current = null;
      }
    });
    return pending;
  }, []);

  const requestChallenge = useCallback(
    async (
      challengeAddress: `0x${string}`,
      challengeChainId: number,
    ): Promise<SignInChallenge> => {
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: challengeAddress,
          chainId: challengeChainId,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const challenge = (await challengeResponse.json()) as {
        challengeId?: string;
        message?: string;
      };
      if (
        !challengeResponse.ok ||
        !challenge.challengeId ||
        !challenge.message
      ) {
        throw new Error(
          challenge.message ?? "Unable to start wallet sign-in.",
        );
      }
      return {
        challengeId: challenge.challengeId,
        message: challenge.message,
      };
    },
    [],
  );

  const primeChallenge = useCallback(
    (
      challengeAddress: `0x${string}`,
      challengeChainId: number,
    ) => {
      if (challengeChainId !== ARC.chainId) {
        return Promise.reject(
          new Error("Switch to Arc Testnet before signing in."),
        );
      }

      const key = `${challengeAddress.toLowerCase()}:${challengeChainId}`;
      const existing = challengeRef.current;
      if (
        existing?.key === key &&
        Date.now() - existing.createdAt < CHALLENGE_CACHE_MS
      ) {
        return existing.promise;
      }

      const entry: ChallengeEntry = {
        key,
        createdAt: Date.now(),
        promise: requestChallenge(challengeAddress, challengeChainId),
      };
      challengeRef.current = entry;
      void entry.promise.catch(() => {
        if (challengeRef.current === entry) {
          challengeRef.current = null;
        }
      });
      return entry.promise;
    },
    [requestChallenge],
  );

  const refreshSession = useCallback(async () => {
    const sessionVersion = sessionVersionRef.current;
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (sessionVersion !== sessionVersionRef.current) return;
      if (!response.ok) {
        setAuthenticated(false);
        clearCachedSession();
        return;
      }
      const session = (await response.json()) as {
        authenticated: boolean;
        address?: `0x${string}`;
        chainId?: number;
      };
      if (sessionVersion !== sessionVersionRef.current) return;
      setAuthenticated(session.authenticated);
      if (session.address) {
        const sessionAddress = getAddress(session.address);
        setAddress(sessionAddress);
        if (session.chainId) {
          storeCachedSession(sessionAddress, session.chainId);
        }
      }
      if (session.chainId) setChainId(session.chainId);
    } catch {
      // Preserve an optimistic cached session during a temporary backend delay.
    } finally {
      setReady(true);
    }
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const cached = JSON.parse(
          window.localStorage.getItem(SESSION_CACHE_KEY) ?? "null",
        ) as { address?: string; chainId?: number } | null;
        if (cached?.address && cached.chainId) {
          setAddress(getAddress(cached.address));
          setChainId(cached.chainId);
          setAuthenticated(true);
        }
      } catch {
        clearCachedSession();
      } finally {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sessionTimer = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    return () => window.clearTimeout(sessionTimer);
  }, [refreshSession]);

  useEffect(() => {
    const announceProvider = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (
        !detail?.info?.uuid ||
        !detail.info.name ||
        typeof detail.provider?.request !== "function"
      ) {
        return;
      }
      setProviders((current) => {
        if (current.some((item) => item.info.uuid === detail.info.uuid)) {
          return current;
        }
        const announced = current.filter(
          (item) => !item.info.uuid.startsWith("legacy-"),
        );
        return sortWalletProviders([...announced, detail]);
      });
    };

    window.addEventListener("eip6963:announceProvider", announceProvider);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const fallbackTimer = window.setTimeout(() => {
      setProviders((current) =>
        current.length ? current : sortWalletProviders(legacyProviders()),
      );
    }, 250);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("eip6963:announceProvider", announceProvider);
    };
  }, []);

  useEffect(() => {
    const provider = activeProvider?.provider;
    if (!provider) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      const nextAddress = accounts[0] ? getAddress(accounts[0]) : null;
      const changed =
        !nextAddress || nextAddress.toLowerCase() !== address?.toLowerCase();
      setAddress(nextAddress);
      if (changed) {
        sessionVersionRef.current += 1;
        challengeRef.current = null;
        clearCachedSession();
        setAuthenticated(false);
        void startSessionReset();
      }
    };
    const onChainChanged = (...args: unknown[]) => {
      setChainId(Number.parseInt(args[0] as string, 16));
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [activeProvider, address, startSessionReset]);

  const installedWallets = useMemo(
    () =>
      providers.map((detail) => ({
        id: detail.info.uuid,
        name: detail.info.name,
        rdns: detail.info.rdns,
        icon: safeWalletIcon(detail.info.icon),
      })),
    [providers],
  );

  const ensureProvider = useCallback(async () => {
    if (!address) {
      throw new Error("Connect the agreement client wallet before funding.");
    }

    const candidates = activeProvider
      ? [
          activeProvider,
          ...providers.filter(
            (detail) => detail.info.uuid !== activeProvider.info.uuid,
          ),
        ]
      : providers.length
        ? providers
        : sortWalletProviders(legacyProviders());

    const probes = await Promise.all(
      candidates.map(async (detail) => {
        try {
          const accounts = await providerRequestWithTimeout<string[]>(
            detail.provider,
            { method: "eth_accounts" },
          );
          const hasSessionAccount = accounts.some(
            (account) => account.toLowerCase() === address.toLowerCase(),
          );
          if (!hasSessionAccount) return null;
          const network = await providerRequestWithTimeout<string>(
            detail.provider,
            { method: "eth_chainId" },
          );
          return { detail, chainId: Number.parseInt(network, 16) };
        } catch {
          return null;
        }
      }),
    );
    const connected = probes.find(
      (
        probe,
      ): probe is {
        detail: Eip6963ProviderDetail;
        chainId: number;
      } => probe !== null,
    );
    if (connected) {
      setSelectedEthereumProvider(connected.detail.provider);
      setActiveProvider(connected.detail);
      setChainId(connected.chainId);
      return connected.detail.provider;
    }

    throw new Error(
      "Unlock the client wallet and choose Reconnect wallet before funding. The signed-in account must also be active in the extension.",
    );
  }, [activeProvider, address, providers]);

  useEffect(() => {
    if (!authenticated || !address || activeProvider || providers.length === 0) {
      return;
    }
    let cancelled = false;

    async function restoreConnectedProvider() {
      const probes = await Promise.all(
        providers.map(async (detail) => {
          try {
            const accounts = await providerRequestWithTimeout<string[]>(
              detail.provider,
              { method: "eth_accounts" },
            );
            const hasSessionAccount = accounts.some(
              (account) => account.toLowerCase() === address?.toLowerCase(),
            );
            if (!hasSessionAccount) return null;
            const network = await providerRequestWithTimeout<string>(
              detail.provider,
              { method: "eth_chainId" },
            );
            return { detail, chainId: Number.parseInt(network, 16) };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const connected = probes.find((probe) => probe !== null);
      if (!connected) return;
      setSelectedEthereumProvider(connected.detail.provider);
      setActiveProvider(connected.detail);
      setChainId(connected.chainId);
    }

    void restoreConnectedProvider();
    return () => {
      cancelled = true;
    };
  }, [activeProvider, address, authenticated, providers]);

  useEffect(() => {
    if (
      !authenticated &&
      address &&
      chainId === ARC.chainId &&
      activeProvider
    ) {
      void primeChallenge(address, chainId).catch(() => {});
    }
  }, [activeProvider, address, authenticated, chainId, primeChallenge]);

  const connect = useCallback(
    async (walletId: string) => {
      const detail = providers.find((item) => item.info.uuid === walletId);
      if (!detail) {
        setError("The selected wallet is no longer available.");
        return false;
      }

      setBusy(true);
      setError(null);
      try {
        const accounts = await detail.provider.request<string[]>({
          method: "eth_requestAccounts",
        });
        if (!accounts[0]) throw new Error("No wallet account was returned.");
        const network = await providerRequestWithTimeout<string>(
          detail.provider,
          { method: "eth_chainId" },
        );
        const connectedAddress = getAddress(accounts[0]);
        const connectedChainId = Number.parseInt(network, 16);
        const keepsSession =
          authenticated &&
          address?.toLowerCase() === connectedAddress.toLowerCase();
        if (authenticated && !keepsSession) {
          clearCachedSession();
          void startSessionReset();
        }
        sessionVersionRef.current += 1;
        setSelectedEthereumProvider(detail.provider);
        setActiveProvider(detail);
        setAddress(connectedAddress);
        setChainId(connectedChainId);
        setAuthenticated(keepsSession);
        challengeRef.current = null;
        if (!keepsSession && connectedChainId === ARC.chainId) {
          void primeChallenge(connectedAddress, connectedChainId).catch(() => {});
        }
        return true;
      } catch (requestError) {
        setError(walletError(requestError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [
      address,
      authenticated,
      primeChallenge,
      providers,
      startSessionReset,
    ],
  );

  const switchToArc = useCallback(async () => {
    setBusy(true);
    setError(null);
    const chainIdHex = `0x${ARC.chainId.toString(16)}`;
    try {
      const provider = activeProvider?.provider ?? (await ensureProvider());
      const currentChain = await providerRequestWithTimeout<string>(
        provider,
        { method: "eth_chainId" },
      );
      if (Number.parseInt(currentChain, 16) === ARC.chainId) {
        setChainId(ARC.chainId);
        if (address && !authenticated) {
          void primeChallenge(address, ARC.chainId).catch(() => {});
        }
        return;
      }
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError) {
        const code =
          typeof switchError === "object" &&
          switchError !== null &&
          "code" in switchError
            ? switchError.code
            : null;
        if (code !== 4902) throw switchError;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: "Arc Testnet",
              nativeCurrency: {
                name: "USDC",
                symbol: "USDC",
                decimals: 18,
              },
              rpcUrls: [...ARC.rpcUrls],
              blockExplorerUrls: [ARC.explorerUrl],
            },
          ],
        });
      }
      const activeChain = await providerRequestWithTimeout<string>(
        provider,
        { method: "eth_chainId" },
      );
      const activeChainId = Number.parseInt(activeChain, 16);
      if (activeChainId !== ARC.chainId) {
        throw new Error("The Arc network switch was not completed.");
      }
      setChainId(activeChainId);
      if (address && !authenticated) {
        void primeChallenge(address, activeChainId).catch(() => {});
      }
    } catch (switchError) {
      const message = walletError(switchError);
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, [
    activeProvider,
    address,
    authenticated,
    ensureProvider,
    primeChallenge,
  ]);

  const signIn = useCallback(async () => {
    const provider = activeProvider?.provider;
    if (!provider || !address) {
      setError("Choose and connect a wallet before signing in.");
      return;
    }
    if (chainId !== ARC.chainId) {
      setError("Switch to Arc Testnet before signing in.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const challenge = await primeChallenge(address, chainId);

      const signature = await provider.request<`0x${string}`>({
        method: "personal_sign",
        params: [stringToHex(challenge.message), address],
      });
      if (sessionResetRef.current) {
        await sessionResetRef.current;
      }
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          address,
          signature,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const verification = (await verifyResponse.json()) as {
        message?: string;
      };
      if (!verifyResponse.ok) {
        throw new Error(verification.message ?? "Wallet sign-in failed.");
      }
      sessionVersionRef.current += 1;
      setAuthenticated(true);
      storeCachedSession(address, chainId);
      challengeRef.current = null;
    } catch (signInError) {
      setError(walletError(signInError));
    } finally {
      setBusy(false);
    }
  }, [activeProvider, address, chainId, primeChallenge]);

  const signMessage = useCallback(async (message: string) => {
    if (!authenticated || !address) {
      throw new Error("Sign in with the agreement wallet before signing this record.");
    }
    if (chainId !== ARC.chainId) {
      throw new Error("Switch the connected wallet to Arc Testnet before signing this record.");
    }
    const provider = await ensureProvider();
    const signature = await provider.request<`0x${string}`>({
      method: "personal_sign",
      params: [stringToHex(message), address],
    });
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
      throw new Error("The wallet did not return a valid signature.");
    }
    return signature;
  }, [address, authenticated, chainId, ensureProvider]);

  const signOut = useCallback(async () => {
    setError(null);
    sessionVersionRef.current += 1;
    challengeRef.current = null;
    clearCachedSession();
    setAuthenticated(false);
    setAddress(null);
    setChainId(null);
    setActiveProvider(null);
    setSelectedEthereumProvider(null);
    void startSessionReset();
  }, [startSessionReset]);

  const value = useMemo(
    () => ({
      address,
      chainId,
      authenticated,
      ready,
      busy,
      error,
      hasProvider: installedWallets.length > 0,
      installedWallets,
      activeWalletName: activeProvider?.info.name ?? null,
      clearError: () => setError(null),
      connect,
      ensureProvider,
      switchToArc,
      signMessage,
      signIn,
      signOut,
    }),
    [
      activeProvider,
      address,
      authenticated,
      busy,
      chainId,
      connect,
      ensureProvider,
      error,
      installedWallets,
      ready,
      signIn,
      signMessage,
      signOut,
      switchToArc,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
