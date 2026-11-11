export type AgreementTemplateMilestone = {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  reviewDays: number;
  revisionLimit: number;
  acceptanceChecklist?: string[];
};

export type AgreementTemplate = {
  id: "product-delivery" | "creative-campaign" | "consulting-sprint";
  label: string;
  description: string;
  agreementTitle: string;
  milestones: AgreementTemplateMilestone[];
};

function futureDate(daysFromNow: number, now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow),
  )
    .toISOString()
    .slice(0, 10);
}

export function agreementTemplates(now = new Date()): AgreementTemplate[] {
  return [
    {
      id: "product-delivery",
      label: "Product delivery",
      description: "Scope, build, and a final handoff for a digital product engagement.",
      agreementTitle: "Product delivery engagement",
      milestones: [
        {
          title: "Discovery & scope",
          description: "Confirm the requirements, delivery plan, and agreed acceptance criteria.",
          amount: "",
          dueDate: futureDate(7, now),
          reviewDays: 3,
          revisionLimit: 1,
        },
        {
          title: "Build & handoff",
          description: "Deliver the agreed product work, source materials, and handoff notes.",
          amount: "",
          dueDate: futureDate(21, now),
          reviewDays: 5,
          revisionLimit: 2,
        },
      ],
    },
    {
      id: "creative-campaign",
      label: "Creative campaign",
      description: "Direction, production, and launch-ready creative assets.",
      agreementTitle: "Creative campaign delivery",
      milestones: [
        {
          title: "Creative direction",
          description: "Deliver the campaign direction, references, and production plan for approval.",
          amount: "",
          dueDate: futureDate(5, now),
          reviewDays: 3,
          revisionLimit: 1,
        },
        {
          title: "Asset production",
          description: "Deliver the agreed creative assets in the required formats and specifications.",
          amount: "",
          dueDate: futureDate(14, now),
          reviewDays: 3,
          revisionLimit: 2,
        },
        {
          title: "Launch handoff",
          description: "Deliver final approved assets, usage notes, and any agreed source files.",
          amount: "",
          dueDate: futureDate(21, now),
          reviewDays: 3,
          revisionLimit: 1,
        },
      ],
    },
    {
      id: "consulting-sprint",
      label: "Consulting sprint",
      description: "A focused engagement from kickoff through recommendations and handoff.",
      agreementTitle: "Consulting sprint",
      milestones: [
        {
          title: "Kickoff & information review",
          description: "Align on the problem, review available materials, and confirm the sprint scope.",
          amount: "",
          dueDate: futureDate(3, now),
          reviewDays: 2,
          revisionLimit: 0,
        },
        {
          title: "Recommendations",
          description: "Present evidence-based recommendations and the supporting analysis for review.",
          amount: "",
          dueDate: futureDate(10, now),
          reviewDays: 3,
          revisionLimit: 1,
        },
        {
          title: "Final handoff",
          description: "Deliver the final recommendations, prioritised next steps, and handoff materials.",
          amount: "",
          dueDate: futureDate(17, now),
          reviewDays: 3,
          revisionLimit: 1,
        },
      ],
    },
  ];
}
