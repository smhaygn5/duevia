const preferredWallets = [
  ["metamask", "io.metamask"],
  ["okx", "com.okex.wallet"],
  ["rabby", "io.rabby"],
  ["trust", "com.trustwallet"],
  ["phantom", "app.phantom"],
  ["coinbase", "com.coinbase.wallet"],
] as const;

function searchableWalletName(wallet: Pick<Eip6963ProviderInfo, "name" | "rdns">) {
  return `${wallet.name} ${wallet.rdns}`.toLowerCase();
}

export function walletPriority(
  wallet: Pick<Eip6963ProviderInfo, "name" | "rdns">,
) {
  const searchable = searchableWalletName(wallet);
  const index = preferredWallets.findIndex((aliases) =>
    aliases.some((alias) => searchable.includes(alias)),
  );
  return index === -1 ? preferredWallets.length : index;
}

export function sortWalletProviders<T extends Eip6963ProviderDetail>(
  providers: T[],
) {
  return [...providers].sort((left, right) => {
    const priority = walletPriority(left.info) - walletPriority(right.info);
    return priority || left.info.name.localeCompare(right.info.name);
  });
}

export function safeWalletIcon(icon: string) {
  const value = icon.trim();
  if (
    value.length > 100_000 ||
    !/^data:image\/(?:png|gif|jpe?g|webp|svg\+xml)(?:;[^,]*)?,/i.test(value)
  ) {
    return null;
  }
  return value;
}

export function legacyWalletName(provider: EthereumProvider) {
  if (provider.isOkxWallet) return "OKX Wallet";
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isTrust) return "Trust Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
}
