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

type WalletContextValue = {
  address: `0x${string}` | null;
  chainId: number | null;
  authenticated: boolean;
  ready: boolean;
  busy: boolean;
  error: string | null;
  hasProvider: boolean;
  connect: () => Promise<void>;
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

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProvider =
    typeof window !== "undefined" && Boolean(window.ethereum);

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
    const provider = window.ethereum;
    const sessionTimer = window.setTimeout(() => {
      void refreshSession();
    }, 0);
    if (!provider) {
      return () => window.clearTimeout(sessionTimer);
    }

    void provider
      .request<string[]>({ method: "eth_accounts" })
      .then((accounts) => {
        if (accounts[0]) setAddress(getAddress(accounts[0]));
      });
    void provider.request<string>({ method: "eth_chainId" }).then((value) => {
      setChainId(Number.parseInt(value, 16));
    });

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts[0] ? getAddress(accounts[0]) : null);
      setAuthenticated(false);
    };
    const onChainChanged = (...args: unknown[]) => {
      setChainId(Number.parseInt(args[0] as string, 16));
      setAuthenticated(false);
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      window.clearTimeout(sessionTimer);
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, [refreshSession]);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("Install an EVM wallet to connect. You can still explore the demo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accounts = await provider.request<string[]>({
        method: "eth_requestAccounts",
      });
      if (!accounts[0]) throw new Error("No wallet account was returned.");
      const network = await provider.request<string>({ method: "eth_chainId" });
      setAddress(getAddress(accounts[0]));
      setChainId(Number.parseInt(network, 16));
    } catch (requestError) {
      setError(walletError(requestError));
    } finally {
      setBusy(false);
    }
  }, []);

  const switchToArc = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("An EVM wallet is required to switch networks.");
      return;
    }
    setBusy(true);
    setError(null);
    const chainIdHex = `0x${ARC.chainId.toString(16)}`;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
      setChainId(ARC.chainId);
    } catch (switchError) {
      const code =
        typeof switchError === "object" &&
        switchError !== null &&
        "code" in switchError
          ? switchError.code
          : null;
      if (code !== 4902) {
        setError(walletError(switchError));
        setBusy(false);
        return;
      }
      try {
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
        setChainId(ARC.chainId);
      } catch (addError) {
        setError(walletError(addError));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider || !address) {
      setError("Connect a wallet before signing in.");
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
  }, [address, chainId]);

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      setAuthenticated(false);
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
      hasProvider,
      connect,
      switchToArc,
      signIn,
      signOut,
    }),
    [
      address,
      authenticated,
      busy,
      chainId,
      connect,
      error,
      hasProvider,
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
