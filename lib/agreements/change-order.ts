export function canAcceptChangeOrder(
  proposerWalletId: string,
  currentWalletId: string | null,
  status: string,
) {
  return Boolean(currentWalletId) && status === "pending" && proposerWalletId !== currentWalletId;
}
