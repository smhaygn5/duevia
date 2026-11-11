export type AcceptanceChecklistPreset = {
  id: "scope" | "creative" | "handoff" | "consulting";
  label: string;
  items: string[];
};

export const acceptanceChecklistPresets: AcceptanceChecklistPreset[] = [
  { id: "scope", label: "Scope review", items: ["The agreed scope is covered.", "The required deliverables are present.", "Any exclusions are documented."] },
  { id: "creative", label: "Creative assets", items: ["Assets match the approved direction.", "Required formats and dimensions are included.", "Usage rights and source files are included where agreed."] },
  { id: "handoff", label: "Product handoff", items: ["The agreed product work is delivered.", "Documentation or handoff notes are included.", "The delivery can be accessed and reviewed."] },
  { id: "consulting", label: "Consulting review", items: ["Recommendations address the agreed question.", "Supporting analysis is included.", "Next steps and assumptions are clear."] },
];

export function checklistForPreset(id: string) {
  return acceptanceChecklistPresets.find((preset) => preset.id === id)?.items ?? [];
}
