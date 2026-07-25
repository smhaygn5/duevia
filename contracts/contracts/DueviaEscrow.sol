// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DueviaEscrow
 * @notice Single-agreement, sequential milestone escrow denominated in USDC.
 * @dev Business text and files stay offchain. Only hashes, state, and settlement
 *      amounts are written onchain.
 */
contract DueviaEscrow is ReentrancyGuard {
  using SafeERC20 for IERC20;

  enum AgreementState {
    AwaitingFunding,
    Active,
    CancelPending,
    Completed,
    Cancelled,
    Refunded
  }

  enum MilestoneState {
    Pending,
    InProgress,
    Submitted,
    ChangesRequested,
    Released,
    Refunded
  }

  struct Milestone {
    bytes32 milestoneRef;
    uint256 amount;
    uint64 dueDate;
    uint32 reviewWindow;
    uint8 revisionLimit;
    uint8 revisionsUsed;
    uint64 submittedAt;
    MilestoneState state;
  }

  error Unauthorized();
  error InvalidState();
  error InvalidConfiguration();
  error NotCurrentMilestone();
  error ReviewWindowClosed();
  error DeadlineNotReached();
  error RevisionLimitReached();
  error WorkAlreadyStarted();
  error TokenTransferMismatch();

  IERC20 public immutable usdc;
  address public immutable client;
  address public immutable provider;
  bytes32 public immutable agreementRef;
  uint64 public immutable nonDeliveryGracePeriod;
  uint256 public immutable totalAmount;

  AgreementState public state;
  uint256 public currentMilestone;
  uint256 public releasedAmount;
  uint256 public refundedAmount;
  bool public clientCancellationApproved;
  bool public providerCancellationApproved;

  Milestone[] private milestones;

  event AgreementFunded(bytes32 indexed agreementRef, uint256 amount);
  event MilestoneStarted(
    bytes32 indexed agreementRef,
    uint256 indexed milestoneIndex
  );
  event MilestoneSubmitted(
    bytes32 indexed agreementRef,
    uint256 indexed milestoneIndex,
    bytes32 indexed submissionRef,
    uint64 reviewDeadline
  );
  event ChangesRequested(
    bytes32 indexed agreementRef,
    uint256 indexed milestoneIndex,
    uint8 revisionsUsed
  );
  event MilestoneReleased(
    bytes32 indexed agreementRef,
    uint256 indexed milestoneIndex,
    uint256 amount
  );
  event CancellationApproval(
    bytes32 indexed agreementRef,
    address indexed party,
    bool approved
  );
  event AgreementSettled(
    bytes32 indexed agreementRef,
    AgreementState state,
    uint256 releasedAmount,
    uint256 refundedAmount
  );

  modifier onlyClient() {
    if (msg.sender != client) revert Unauthorized();
    _;
  }

  modifier onlyProvider() {
    if (msg.sender != provider) revert Unauthorized();
    _;
  }

  modifier onlyParty() {
    if (msg.sender != client && msg.sender != provider) revert Unauthorized();
    _;
  }

  modifier whenOperational() {
    if (
      state != AgreementState.Active &&
      state != AgreementState.CancelPending
    ) revert InvalidState();
    _;
  }

  constructor(
    IERC20 usdc_,
    address client_,
    address provider_,
    bytes32 agreementRef_,
    bytes32[] memory milestoneRefs_,
    uint256[] memory amounts_,
    uint64[] memory dueDates_,
    uint32[] memory reviewWindows_,
    uint8[] memory revisionLimits_,
    uint64 nonDeliveryGracePeriod_
  ) {
    uint256 count = milestoneRefs_.length;
    if (
      address(usdc_) == address(0) ||
      client_ == address(0) ||
      provider_ == address(0) ||
      client_ == provider_ ||
      agreementRef_ == bytes32(0) ||
      count == 0 ||
      count > 50 ||
      count != amounts_.length ||
      count != dueDates_.length ||
      count != reviewWindows_.length ||
      count != revisionLimits_.length ||
      nonDeliveryGracePeriod_ == 0
    ) revert InvalidConfiguration();

    usdc = usdc_;
    client = client_;
    provider = provider_;
    agreementRef = agreementRef_;
    nonDeliveryGracePeriod = nonDeliveryGracePeriod_;

    uint256 computedTotal;
    uint64 previousDueDate;
    for (uint256 index; index < count; ++index) {
      if (
        milestoneRefs_[index] == bytes32(0) ||
        amounts_[index] == 0 ||
        dueDates_[index] <= block.timestamp ||
        dueDates_[index] <= previousDueDate ||
        reviewWindows_[index] == 0
      ) revert InvalidConfiguration();

      milestones.push(
        Milestone({
          milestoneRef: milestoneRefs_[index],
          amount: amounts_[index],
          dueDate: dueDates_[index],
          reviewWindow: reviewWindows_[index],
          revisionLimit: revisionLimits_[index],
          revisionsUsed: 0,
          submittedAt: 0,
          state: MilestoneState.Pending
        })
      );
      computedTotal += amounts_[index];
      previousDueDate = dueDates_[index];
    }

    totalAmount = computedTotal;
    state = AgreementState.AwaitingFunding;
  }

  function milestoneCount() external view returns (uint256) {
    return milestones.length;
  }

  function getMilestone(
    uint256 index
  ) external view returns (Milestone memory) {
    return milestones[index];
  }

  function lockedAmount() external view returns (uint256) {
    return totalAmount - releasedAmount - refundedAmount;
  }

  function fund() external onlyClient nonReentrant {
    if (state != AgreementState.AwaitingFunding) revert InvalidState();

    uint256 balanceBefore = usdc.balanceOf(address(this));
    usdc.safeTransferFrom(client, address(this), totalAmount);
    if (usdc.balanceOf(address(this)) - balanceBefore != totalAmount) {
      revert TokenTransferMismatch();
    }

    state = AgreementState.Active;
    emit AgreementFunded(agreementRef, totalAmount);
  }

  function startCurrentMilestone() external onlyProvider whenOperational {
    Milestone storage milestone = milestones[currentMilestone];
    if (milestone.state != MilestoneState.Pending) revert InvalidState();

    milestone.state = MilestoneState.InProgress;
    emit MilestoneStarted(agreementRef, currentMilestone);
  }

  function submit(
    uint256 milestoneIndex,
    bytes32 submissionRef
  ) external onlyProvider whenOperational {
    if (milestoneIndex != currentMilestone) revert NotCurrentMilestone();
    if (submissionRef == bytes32(0)) revert InvalidConfiguration();

    Milestone storage milestone = milestones[milestoneIndex];
    if (
      milestone.state != MilestoneState.InProgress &&
      milestone.state != MilestoneState.ChangesRequested
    ) revert InvalidState();

    milestone.state = MilestoneState.Submitted;
    milestone.submittedAt = uint64(block.timestamp);
    emit MilestoneSubmitted(
      agreementRef,
      milestoneIndex,
      submissionRef,
      uint64(block.timestamp + milestone.reviewWindow)
    );
  }

  function requestChanges(
    uint256 milestoneIndex
  ) external onlyClient whenOperational {
    if (milestoneIndex != currentMilestone) revert NotCurrentMilestone();
    Milestone storage milestone = milestones[milestoneIndex];
    if (milestone.state != MilestoneState.Submitted) revert InvalidState();
    if (block.timestamp > milestone.submittedAt + milestone.reviewWindow) {
      revert ReviewWindowClosed();
    }
    if (milestone.revisionsUsed >= milestone.revisionLimit) {
      revert RevisionLimitReached();
    }

    ++milestone.revisionsUsed;
    milestone.state = MilestoneState.ChangesRequested;
    emit ChangesRequested(
      agreementRef,
      milestoneIndex,
      milestone.revisionsUsed
    );
  }

  function approveAndRelease(
    uint256 milestoneIndex
  ) external onlyClient whenOperational nonReentrant {
    if (milestoneIndex != currentMilestone) revert NotCurrentMilestone();
    if (milestones[milestoneIndex].state != MilestoneState.Submitted) {
      revert InvalidState();
    }
    _release(milestoneIndex);
  }

  function claimTimeoutRelease(
    uint256 milestoneIndex
  ) external onlyProvider whenOperational nonReentrant {
    if (milestoneIndex != currentMilestone) revert NotCurrentMilestone();
    Milestone storage milestone = milestones[milestoneIndex];
    if (milestone.state != MilestoneState.Submitted) revert InvalidState();
    if (block.timestamp <= milestone.submittedAt + milestone.reviewWindow) {
      revert DeadlineNotReached();
    }
    _release(milestoneIndex);
  }

  function claimNonDeliveryRefund()
    external
    onlyClient
    whenOperational
    nonReentrant
  {
    Milestone storage milestone = milestones[currentMilestone];
    if (
      milestone.state != MilestoneState.Pending &&
      milestone.state != MilestoneState.InProgress &&
      milestone.state != MilestoneState.ChangesRequested
    ) revert InvalidState();
    if (block.timestamp <= milestone.dueDate + nonDeliveryGracePeriod) {
      revert DeadlineNotReached();
    }

    _refundRemaining(AgreementState.Refunded);
  }

  function cancelBeforeWork() external onlyClient whenOperational nonReentrant {
    if (
      currentMilestone != 0 ||
      releasedAmount != 0 ||
      milestones[0].state != MilestoneState.Pending
    ) revert WorkAlreadyStarted();
    _refundRemaining(AgreementState.Cancelled);
  }

  function approveMutualCancellation()
    external
    onlyParty
    whenOperational
    nonReentrant
  {
    if (msg.sender == client) {
      clientCancellationApproved = true;
    } else {
      providerCancellationApproved = true;
    }
    state = AgreementState.CancelPending;
    emit CancellationApproval(agreementRef, msg.sender, true);

    if (clientCancellationApproved && providerCancellationApproved) {
      _refundRemaining(AgreementState.Cancelled);
    }
  }

  function revokeCancellationApproval() external onlyParty whenOperational {
    if (msg.sender == client) {
      clientCancellationApproved = false;
    } else {
      providerCancellationApproved = false;
    }
    if (!clientCancellationApproved && !providerCancellationApproved) {
      state = AgreementState.Active;
    }
    emit CancellationApproval(agreementRef, msg.sender, false);
  }

  function _release(uint256 milestoneIndex) private {
    Milestone storage milestone = milestones[milestoneIndex];
    uint256 amount = milestone.amount;
    milestone.state = MilestoneState.Released;
    releasedAmount += amount;
    ++currentMilestone;

    if (currentMilestone == milestones.length) {
      state = AgreementState.Completed;
    }

    usdc.safeTransfer(provider, amount);
    emit MilestoneReleased(agreementRef, milestoneIndex, amount);

    if (state == AgreementState.Completed) {
      emit AgreementSettled(
        agreementRef,
        state,
        releasedAmount,
        refundedAmount
      );
    }
  }

  function _refundRemaining(AgreementState finalState) private {
    uint256 amount = totalAmount - releasedAmount - refundedAmount;
    refundedAmount += amount;
    state = finalState;

    for (uint256 index = currentMilestone; index < milestones.length; ++index) {
      if (milestones[index].state != MilestoneState.Released) {
        milestones[index].state = MilestoneState.Refunded;
      }
    }

    usdc.safeTransfer(client, amount);
    emit AgreementSettled(
      agreementRef,
      state,
      releasedAmount,
      refundedAmount
    );
  }
}
