let selectedProvider: EthereumProvider | null = null;

export function setSelectedEthereumProvider(
  provider: EthereumProvider | null,
) {
  selectedProvider = provider;
}

export function getSelectedEthereumProvider() {
  return selectedProvider;
}
