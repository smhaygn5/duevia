// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DueviaEscrow} from "./DueviaEscrow.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract DueviaEscrowTest is Test {
  uint256 private constant FIRST_AMOUNT = 600e6;
  uint256 private constant SECOND_AMOUNT = 400e6;
  uint256 private constant TOTAL_AMOUNT = FIRST_AMOUNT + SECOND_AMOUNT;
  uint256 private constant STARTING_BALANCE = 2_000e6;
  uint64 private constant GRACE_PERIOD = 2 days;

  address private client = makeAddr("client");
  address private provider = makeAddr("provider");
  address private stranger = makeAddr("stranger");

  MockUSDC private usdc;
  DueviaEscrow private escrow;
  uint64 private firstDue;

  function setUp() public {
    usdc = new MockUSDC();
    firstDue = uint64(block.timestamp + 7 days);

    bytes32[] memory refs = new bytes32[](2);
    refs[0] = keccak256("discovery");
    refs[1] = keccak256("delivery");

    uint256[] memory amounts = new uint256[](2);
    amounts[0] = FIRST_AMOUNT;
    amounts[1] = SECOND_AMOUNT;

    uint64[] memory dueDates = new uint64[](2);
    dueDates[0] = firstDue;
    dueDates[1] = uint64(block.timestamp + 14 days);

    uint32[] memory reviewWindows = new uint32[](2);
    reviewWindows[0] = 2 days;
    reviewWindows[1] = 2 days;

    uint8[] memory revisionLimits = new uint8[](2);
    revisionLimits[0] = 1;
    revisionLimits[1] = 1;

    escrow = new DueviaEscrow(
      usdc,
      client,
      provider,
      keccak256("DV-2048"),
      refs,
      amounts,
      dueDates,
      reviewWindows,
      revisionLimits,
      GRACE_PERIOD
    );

    usdc.mint(client, STARTING_BALANCE);
    vm.prank(client);
    usdc.approve(address(escrow), TOTAL_AMOUNT);
  }

  function test_FundAndCompleteSequentialAgreement() public {
    _fund();
    assertEq(usdc.balanceOf(address(escrow)), TOTAL_AMOUNT);

    _startAndSubmit(0, "submission-one");
    vm.prank(client);
    escrow.approveAndRelease(0);

    _startAndSubmit(1, "submission-two");
    vm.prank(client);
    escrow.approveAndRelease(1);

    assertEq(
      uint256(escrow.state()),
      uint256(DueviaEscrow.AgreementState.Completed)
    );
    assertEq(escrow.releasedAmount(), TOTAL_AMOUNT);
    assertEq(usdc.balanceOf(provider), TOTAL_AMOUNT);
    assertEq(usdc.balanceOf(address(escrow)), 0);
  }

  function test_RevisionLimitAndProviderTimeoutRelease() public {
    _fund();
    _startAndSubmit(0, "first-version");

    vm.prank(client);
    escrow.requestChanges(0);

    vm.prank(provider);
    escrow.submit(0, keccak256("second-version"));

    vm.expectRevert(DueviaEscrow.RevisionLimitReached.selector);
    vm.prank(client);
    escrow.requestChanges(0);

    vm.warp(block.timestamp + 2 days + 1);
    vm.prank(provider);
    escrow.claimTimeoutRelease(0);

    assertEq(escrow.releasedAmount(), FIRST_AMOUNT);
    assertEq(usdc.balanceOf(provider), FIRST_AMOUNT);
  }

  function test_ClientCanRefundAfterNonDeliveryDeadline() public {
    _fund();
    vm.warp(uint256(firstDue) + GRACE_PERIOD + 1);

    vm.prank(client);
    escrow.claimNonDeliveryRefund();

    assertEq(
      uint256(escrow.state()),
      uint256(DueviaEscrow.AgreementState.Refunded)
    );
    assertEq(escrow.refundedAmount(), TOTAL_AMOUNT);
    assertEq(usdc.balanceOf(client), STARTING_BALANCE);
    assertEq(usdc.balanceOf(address(escrow)), 0);
  }

  function test_ClientCanCancelBeforeProviderStartsWork() public {
    _fund();

    vm.prank(client);
    escrow.cancelBeforeWork();

    assertEq(
      uint256(escrow.state()),
      uint256(DueviaEscrow.AgreementState.Cancelled)
    );
    assertEq(usdc.balanceOf(client), STARTING_BALANCE);
  }

  function test_MutualCancellationPreservesReleasedWorkAndRefundsRemainder() public {
    _fund();
    _startAndSubmit(0, "approved-work");
    vm.prank(client);
    escrow.approveAndRelease(0);

    vm.prank(client);
    escrow.approveMutualCancellation();
    assertEq(
      uint256(escrow.state()),
      uint256(DueviaEscrow.AgreementState.CancelPending)
    );

    vm.prank(provider);
    escrow.approveMutualCancellation();

    assertEq(
      uint256(escrow.state()),
      uint256(DueviaEscrow.AgreementState.Cancelled)
    );
    assertEq(usdc.balanceOf(provider), FIRST_AMOUNT);
    assertEq(usdc.balanceOf(client), STARTING_BALANCE - FIRST_AMOUNT);
    assertEq(escrow.refundedAmount(), SECOND_AMOUNT);
  }

  function test_UnauthorizedAndDoubleReleaseAreRejected() public {
    _fund();
    vm.expectRevert(DueviaEscrow.Unauthorized.selector);
    vm.prank(stranger);
    escrow.startCurrentMilestone();

    _startAndSubmit(0, "valid-work");
    vm.prank(client);
    escrow.approveAndRelease(0);

    vm.expectRevert(DueviaEscrow.NotCurrentMilestone.selector);
    vm.prank(client);
    escrow.approveAndRelease(0);
  }

  function test_TimeoutCannotBeClaimedEarly() public {
    _fund();
    _startAndSubmit(0, "valid-work");

    vm.expectRevert(DueviaEscrow.DeadlineNotReached.selector);
    vm.prank(provider);
    escrow.claimTimeoutRelease(0);
  }

  function _fund() private {
    vm.prank(client);
    escrow.fund();
  }

  function _startAndSubmit(uint256 index, string memory seed) private {
    vm.startPrank(provider);
    escrow.startCurrentMilestone();
    escrow.submit(index, keccak256(bytes(seed)));
    vm.stopPrank();
  }
}
