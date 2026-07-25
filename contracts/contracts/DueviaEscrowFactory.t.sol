// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DueviaEscrow} from "./DueviaEscrow.sol";
import {DueviaEscrowFactory} from "./DueviaEscrowFactory.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract DueviaEscrowFactoryTest is Test {
  address private client = makeAddr("factory-client");
  address private provider = makeAddr("factory-provider");
  address private stranger = makeAddr("factory-stranger");

  MockUSDC private usdc;
  DueviaEscrowFactory private factory;

  function setUp() public {
    usdc = new MockUSDC();
    factory = new DueviaEscrowFactory(usdc);
  }

  function test_ClientCreatesIsolatedAgreementEscrow() public {
    bytes32 agreementRef = keccak256("DV-FACTORY");
    vm.prank(client);
    address deployed = factory.createEscrow(_config(agreementRef));

    DueviaEscrow escrow = DueviaEscrow(deployed);
    assertEq(factory.escrowByAgreement(agreementRef), deployed);
    assertEq(address(escrow.usdc()), address(usdc));
    assertEq(escrow.client(), client);
    assertEq(escrow.provider(), provider);
    assertEq(escrow.totalAmount(), 1_000e6);
    assertEq(escrow.milestoneCount(), 2);
  }

  function test_StrangerAndDuplicateDeploymentAreRejected() public {
    bytes32 agreementRef = keccak256("DV-UNIQUE");

    vm.expectRevert(DueviaEscrowFactory.Unauthorized.selector);
    vm.prank(stranger);
    factory.createEscrow(_config(agreementRef));

    vm.prank(client);
    factory.createEscrow(_config(agreementRef));

    vm.expectRevert(DueviaEscrowFactory.AgreementAlreadyDeployed.selector);
    vm.prank(client);
    factory.createEscrow(_config(agreementRef));

    bytes32 providerAttempt = keccak256("DV-PROVIDER");
    vm.expectRevert(DueviaEscrowFactory.Unauthorized.selector);
    vm.prank(provider);
    factory.createEscrow(_config(providerAttempt));
  }

  function _config(
    bytes32 agreementRef
  ) private view returns (DueviaEscrowFactory.EscrowConfig memory config) {
    config = DueviaEscrowFactory.EscrowConfig({
      client: client,
      provider: provider,
      agreementRef: agreementRef,
      milestoneRefs: _refs(),
      amounts: _amounts(),
      dueDates: _dueDates(),
      reviewWindows: _reviewWindows(),
      revisionLimits: _revisionLimits(),
      nonDeliveryGracePeriod: 2 days
    });
  }

  function _refs() private pure returns (bytes32[] memory refs) {
    refs = new bytes32[](2);
    refs[0] = keccak256("factory-discovery");
    refs[1] = keccak256("factory-build");
  }

  function _amounts() private pure returns (uint256[] memory amounts) {
    amounts = new uint256[](2);
    amounts[0] = 400e6;
    amounts[1] = 600e6;
  }

  function _dueDates() private view returns (uint64[] memory dueDates) {
    dueDates = new uint64[](2);
    dueDates[0] = uint64(block.timestamp + 7 days);
    dueDates[1] = uint64(block.timestamp + 14 days);
  }

  function _reviewWindows()
    private
    pure
    returns (uint32[] memory reviewWindows)
  {
    reviewWindows = new uint32[](2);
    reviewWindows[0] = 2 days;
    reviewWindows[1] = 2 days;
  }

  function _revisionLimits()
    private
    pure
    returns (uint8[] memory revisionLimits)
  {
    revisionLimits = new uint8[](2);
    revisionLimits[0] = 1;
    revisionLimits[1] = 1;
  }
}
