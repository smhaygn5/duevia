"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  switchToArc: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

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

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        setAuthenticated(false);
        return;
      }
      const session = (await response.json()) as {
        authenticated: boolean;
        address?: `0x${string}`;
        chainId?: number;
      };
      setAuthenticated(session.authenticated);
      if (session.address) setAddress(getAddress(session.address));
      if (session.chainId) setChainId(session.chainId);
    } catch {
      setAuthenticated(false);
    } finally {
      setReady(true);
    }
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
        setAuthenticated(false);
        void fetch("/api/auth/signout", { method: "POST" });
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
  }, [activeProvider, address]);

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

  useEffect(() => {
    if (!authenticated || !address || activeProvider || providers.length === 0) {
      return;
    }
    let cancelled = false;

    async function restoreConnectedProvider() {
      for (const detail of providers) {
        try {
          const accounts = await detail.provider.request<string[]>({
            method: "eth_accounts",
          });
          const hasSessionAccount = accounts.some(
            (account) => account.toLowerCase() === address?.toLowerCase(),
          );
          if (!hasSessionAccount || cancelled) continue;
          const network = await detail.provider.request<string>({
            method: "eth_chainId",
          });
          if (cancelled) return;
          setSelectedEthereumProvider(detail.provider);
          setActiveProvider(detail);
          setChainId(Number.parseInt(network, 16));
          return;
        } catch {
          // A provider may be locked or unavailable; continue without prompting.
        }
      }
    }

    void restoreConnectedProvider();
    return () => {
      cancelled = true;
    };
  }, [activeProvider, address, authenticated, providers]);

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
        const network = await detail.provider.request<string>({
          method: "eth_chainId",
        });
        const connectedAddress = getAddress(accounts[0]);
        const connectedChainId = Number.parseInt(network, 16);
        const keepsSession =
          authenticated &&
          address?.toLowerCase() === connectedAddress.toLowerCase();
        setSelectedEthereumProvider(detail.provider);
        setActiveProvider(detail);
        setAddress(connectedAddress);
        setChainId(connectedChainId);
        setAuthenticated(keepsSession);
        return true;
      } catch (requestError) {
        setError(walletError(requestError));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [address, authenticated, providers],
  );

  const switchToArc = useCallback(async () => {
    const provider = activeProvider?.provider;
    if (!provider) {
      const message = "Choose an installed EVM wallet before switching networks.";
      setError(message);
      throw new Error(message);
    }
    setBusy(true);
    setError(null);
    const chainIdHex = `0x${ARC.chainId.toString(16)}`;
    try {
      const currentChain = await provider.request<string>({
        method: "eth_chainId",
      });
      if (Number.parseInt(currentChain, 16) === ARC.chainId) {
        setChainId(ARC.chainId);
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
      const activeChain = await provider.request<string>({
        method: "eth_chainId",
      });
      const activeChainId = Number.parseInt(activeChain, 16);
      if (activeChainId !== ARC.chainId) {
        throw new Error("The Arc network switch was not completed.");
      }
      setChainId(activeChainId);
    } catch (switchError) {
      const message = walletError(switchError);
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, [activeProvider]);

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
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chainId }),
      });
      const challenge = (await challengeResponse.json()) as {
        challengeId?: string;
        message?: string;
      };
      if (!challengeResponse.ok || !challenge.challengeId || !challenge.message) {
        throw new Error(challenge.message ?? "Unable to start wallet sign-in.");
      }

      const signature = await provider.request<`0x${string}`>({
        method: "personal_sign",
        params: [stringToHex(challenge.message), address],
      });
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          address,
          signature,
        }),
      });
      const verification = (await verifyResponse.json()) as {
        message?: string;
      };
      if (!verifyResponse.ok) {
        throw new Error(verification.message ?? "Wallet sign-in failed.");
      }
      setAuthenticated(true);
    } catch (signInError) {
      setError(walletError(signInError));
    } finally {
      setBusy(false);
    }
  }, [activeProvider, address, chainId]);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      setAuthenticated(false);
      setAddress(null);
      setChainId(null);
      setActiveProvider(null);
      setSelectedEthereumProvider(null);
    } finally {
      setBusy(false);
    }
  }, []);

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
      switchToArc,
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
      error,
      installedWallets,
      ready,
      signIn,
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
