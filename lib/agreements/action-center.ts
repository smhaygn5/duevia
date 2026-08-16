export type ActionCenterInput = {
  id: string;
  type: "review" | "revision" | "deadline";
  agreementRef: string;
  title: string;
  detail: string;
  occurredAt: number;
  href: string;
};

export function sortActionCenterItems(items: ActionCenterInput[]) {
  const priority = { review: 0, revision: 1, deadline: 2 } as const;
  return [...items].sort(
    (left, right) =>
      priority[left.type] - priority[right.type] || right.occurredAt - left.occurredAt,
  );
}
