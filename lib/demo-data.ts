export const demoAgreement = {
  publicRef: "DV-7K2P",
  title: "Global Product Launch",
  client: "Northstar Labs",
  provider: "Orbit Studio",
  total: "4,500",
  locked: "3,500",
  released: "1,000",
  status: "Active",
  chain: "Arc Testnet",
  contractAddress: null,
  currentMilestone: 2,
  reviewDeadline: "2d 14h",
  milestones: [
    {
      position: 1,
      title: "Discovery & scope",
      description:
        "Research, positioning, product requirements, and an approved delivery roadmap.",
      amount: "1,000",
      status: "released",
      due: "Jul 12, 2026",
      reviewDays: 3,
      revisionLimit: 1,
    },
    {
      position: 2,
      title: "Product build",
      description:
        "Responsive application screens, interaction states, and implementation handoff.",
      amount: "2,500",
      status: "submitted",
      due: "Jul 29, 2026",
      reviewDays: 3,
      revisionLimit: 1,
    },
    {
      position: 3,
      title: "Launch handoff",
      description:
        "Production checklist, documentation, asset handoff, and launch support.",
      amount: "1,000",
      status: "pending",
      due: "Aug 8, 2026",
      reviewDays: 3,
      revisionLimit: 1,
    },
  ],
  activities: [
    {
      title: "Product build submitted for review",
      detail: "Orbit Studio added 3 deliverables.",
      time: "Today, 10:42",
      tone: "accent",
    },
    {
      title: "Discovery & scope released",
      detail: "1,000 USDC settled to Orbit Studio on Arc.",
      time: "Jul 15, 14:18",
      tone: "success",
    },
    {
      title: "Agreement funded",
      detail: "4,500 USDC locked in the milestone escrow.",
      time: "Jul 8, 09:31",
      tone: "accent",
    },
    {
      title: "Agreement accepted",
      detail: "Northstar Labs joined the agreement.",
      time: "Jul 7, 18:06",
      tone: "muted",
    },
  ],
} as const;

export const demoAgreements = [
  demoAgreement,
  {
    publicRef: "DV-3F8Q",
    title: "Research sprint",
    client: "Atlas Works",
    provider: "Signal Dept.",
    total: "2,800",
    locked: "0",
    released: "2,800",
    status: "Completed",
    currentMilestone: 3,
  },
  {
    publicRef: "DV-9M1C",
    title: "Commerce redesign",
    client: "Meridian",
    provider: "Orbit Studio",
    total: "7,200",
    locked: "7,200",
    released: "0",
    status: "Awaiting funding",
    currentMilestone: 1,
  },
] as const;

export const demoReceipt = {
  status: "Confirmed",
  title: "Milestone approved",
  description: "1,000 USDC was released on Arc.",
  agreement: demoAgreement.publicRef,
  milestone: "01 · Discovery & scope",
  amount: "1,000 USDC",
  recipient: "0x91D4…42A7",
  network: "Arc Testnet",
  date: "Jul 15, 2026 · 14:18 UTC",
  txHash:
    "0x7c03c77c2b0fb97875d231df3f90a4cc6dfad3b5633a0c733524192da16991f2",
} as const;

export const demoDelivery = {
  milestone: "02 · Product build",
  amount: "2,500 USDC",
  provider: demoAgreement.provider,
  submittedAt: "Jul 25, 2026 · 10:42 UTC",
  reviewDeadline: "Jul 28, 2026 · 10:42 UTC",
  summary:
    "Completed the responsive product screens, interaction states, and implementation handoff.",
  criteria: [
    { label: "Responsive product screens", complete: true },
    { label: "Core interaction states", complete: true },
    { label: "Implementation handoff", complete: true },
  ],
  deliverables: [
    { id: "demo-1", name: "duevia-product-build.zip", meta: "8.4 MB · ZIP" },
    { id: "demo-2", name: "handoff-notes.pdf", meta: "1.2 MB · PDF" },
    { id: "demo-3", name: "Interactive prototype", meta: "External link" },
  ],
} as const;
