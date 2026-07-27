import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyWalletName,
  sortWalletProviders,
  walletPriority,
} from "../lib/wallet/provider-order";

function provider(name: string, rdns: string): Eip6963ProviderDetail {
  return {
    info: { uuid: rdns, name, rdns, icon: "" },
    provider: { request: async <T>() => undefined as T },
  };
}

test("orders MetaMask and OKX before other installed wallets", () => {
  const ordered = sortWalletProviders([
    provider("Coinbase Wallet", "com.coinbase.wallet"),
    provider("Another Wallet", "dev.example.wallet"),
    provider("OKX Wallet", "com.okex.wallet"),
    provider("MetaMask", "io.metamask"),
  ]);

  assert.deepEqual(
    ordered.map((item) => item.info.name),
    ["MetaMask", "OKX Wallet", "Coinbase Wallet", "Another Wallet"],
  );
});

test("recognizes preferred and legacy provider identities", () => {
  assert.equal(walletPriority({ name: "MetaMask", rdns: "io.metamask" }), 0);
  assert.equal(
    legacyWalletName({
      isOkxWallet: true,
      isMetaMask: true,
      request: async <T>() => undefined as T,
    }),
    "OKX Wallet",
  );
});
