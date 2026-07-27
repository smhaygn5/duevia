type EthereumRequest = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

type EthereumProvider = {
  request<T = unknown>(request: EthereumRequest): Promise<T>;
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(
    event: "accountsChanged" | "chainChanged",
    listener: (...args: unknown[]) => void,
  ): void;
};

type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: EthereumProvider;
};

interface Window {
  ethereum?: EthereumProvider;
}
