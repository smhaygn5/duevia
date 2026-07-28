import { defineChain, type Address } from "viem";

export const ARC = {
  chainId: 5_042_002,
  rpcUrls: ["https://rpc.testnet.arc.network"] as const,
  readRpcUrls: [
    "https://arc-testnet.drpc.org",
    "https://rpc.testnet.arc.network",
  ] as const,
  explorerUrl: "https://testnet.arcscan.app",
  cctpDomain: 26,
} as const;

export const ARC_CONTRACTS = {
  dueviaFactory: "0x8097847f00e47Da0Bc6628A3e500215AAeE1fFad",
  usdc: "0x3600000000000000000000000000000000000000",
  cctpTokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  cctpMessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  gatewayMinter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
  memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
  nativeTransferEmitter: "0xfffffffffffffffffffffffffffffffffffffffe",
} as const satisfies Record<string, Address>;

export const arcTestnet = defineChain({
  id: ARC.chainId,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [...ARC.rpcUrls],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC.explorerUrl,
    },
  },
  testnet: true,
});

export const USDC = {
  address: ARC_CONTRACTS.usdc,
  symbol: "USDC",
  erc20Decimals: 6,
  nativeDecimals: 18,
} as const;
