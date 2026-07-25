import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

export default buildModule("DueviaFactory", (module) => {
  const usdc = module.getParameter("usdc", ARC_TESTNET_USDC);
  const factory = module.contract("DueviaEscrowFactory", [usdc]);

  return { factory };
});
