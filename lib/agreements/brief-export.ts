export type AgreementBriefInput = {
  counterparty: string;
  generatedAt: string;
  milestones: Array<{ amount: string; due: string; position: number; status: string; title: string }>;
  nextStep: string;
  publicRef: string;
  released: string;
  status: string;
  title: string;
  total: string;
};

function cleanFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agreement";
}

export function agreementBriefFilename(input: Pick<AgreementBriefInput, "publicRef" | "title">) {
  return `duevia-${cleanFilename(input.title)}-${cleanFilename(input.publicRef)}-brief.md`;
}

export function agreementBriefText(input: AgreementBriefInput) {
  const milestones = input.milestones
    .map((milestone) => `- ${String(milestone.position).padStart(2, "0")}. ${milestone.title} · ${milestone.amount} USDC · ${milestone.status} · due ${milestone.due}`)
    .join("\n");

  return [
    `# ${input.title}`,
    "",
    `Agreement: ${input.publicRef}`,
    `Counterparty: ${input.counterparty}`,
    `Network: Arc Testnet`,
    `Settlement: USDC`,
    `Status: ${input.status}`,
    `Total: ${input.total} USDC`,
    `Released: ${input.released} USDC`,
    `Next step: ${input.nextStep}`,
    "",
    "## Milestones",
    milestones || "- No milestones recorded.",
    "",
    "## Verification boundary",
    "This export summarizes the Duevia workspace. Onchain settlement and transaction status should always be verified on Arc Explorer.",
    "",
    `Generated: ${input.generatedAt}`,
  ].join("\n");
}
