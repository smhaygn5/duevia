export type ApprovalChecklistItem = {
  id: string;
  label: string;
  available: boolean;
};

export function isApprovalChecklistComplete(
  items: ApprovalChecklistItem[],
  selectedIds: string[],
) {
  return (
    items.length > 0 &&
    items.every((item) => item.available && selectedIds.includes(item.id))
  );
}
