// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DueviaEscrow} from "./DueviaEscrow.sol";

/**
 * @title DueviaEscrowFactory
 * @notice Deploys one isolated DueviaEscrow for each accepted agreement.
 * @dev The factory never holds agreement funds and has no owner privileges.
 */
contract DueviaEscrowFactory {
  error Unauthorized();
  error AgreementAlreadyDeployed();

  IERC20 public immutable usdc;
  mapping(bytes32 agreementRef => address escrow) public escrowByAgreement;

  struct EscrowConfig {
    address client;
    address provider;
    bytes32 agreementRef;
    bytes32[] milestoneRefs;
    uint256[] amounts;
    uint64[] dueDates;
    uint32[] reviewWindows;
    uint8[] revisionLimits;
    uint64 nonDeliveryGracePeriod;
  }

  event EscrowCreated(
    bytes32 indexed agreementRef,
    address indexed escrow,
    address indexed client,
    address provider,
    uint256 totalAmount
  );

  constructor(IERC20 usdc_) {
    if (address(usdc_) == address(0)) revert DueviaEscrow.InvalidConfiguration();
    usdc = usdc_;
  }

  function createEscrow(
    EscrowConfig calldata config
  ) external returns (address escrowAddress) {
    if (msg.sender != config.client) {
      revert Unauthorized();
    }
    if (escrowByAgreement[config.agreementRef] != address(0)) {
      revert AgreementAlreadyDeployed();
    }

    DueviaEscrow escrow = new DueviaEscrow(
      usdc,
      config.client,
      config.provider,
      config.agreementRef,
      config.milestoneRefs,
      config.amounts,
      config.dueDates,
      config.reviewWindows,
      config.revisionLimits,
      config.nonDeliveryGracePeriod
    );
    escrowAddress = address(escrow);
    escrowByAgreement[config.agreementRef] = escrowAddress;

    emit EscrowCreated(
      config.agreementRef,
      escrowAddress,
      config.client,
      config.provider,
      escrow.totalAmount()
    );
  }
}
