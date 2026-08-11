export function gatewayArrivalConfirmed(input: {
  arcBalanceBefore: bigint;
  arcBalanceNow: bigint;
  amount: bigint;
}) {
  return input.arcBalanceNow >= input.arcBalanceBefore + input.amount;
}
