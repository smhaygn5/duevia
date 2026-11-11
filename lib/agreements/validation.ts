import { z } from "zod";

export const milestoneInputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(800),
  amount: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, "Enter a valid USDC amount"),
  dueDate: z.string().date(),
  reviewDays: z.number().int().min(1).max(14),
  revisionLimit: z.number().int().min(0).max(5),
  dependencyPosition: z.number().int().min(1).optional(),
  acceptanceChecklist: z.array(z.string().trim().min(3).max(180)).min(1).max(8),
});

export const agreementInputSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    creatorRole: z.enum(["client", "provider"]),
    counterpartyName: z.string().trim().min(2).max(80),
    counterpartyEmail: z
      .string()
      .trim()
      .email()
      .max(160)
      .or(z.literal(""))
      .optional(),
    milestones: z.array(milestoneInputSchema).min(1).max(8),
  })
  .superRefine((agreement, context) => {
    let previous = 0;
    for (const [index, milestone] of agreement.milestones.entries()) {
      const due = Date.parse(`${milestone.dueDate}T12:00:00.000Z`);
      if (!Number.isFinite(due) || due <= Date.now()) {
        context.addIssue({
          code: "custom",
          message: "Milestone due dates must be in the future.",
          path: ["milestones", index, "dueDate"],
        });
      }
      if (due <= previous) {
        context.addIssue({
          code: "custom",
          message: "Milestone due dates must be sequential.",
          path: ["milestones", index, "dueDate"],
        });
      }
      if (milestone.dependencyPosition !== undefined && milestone.dependencyPosition >= index + 1) {
        context.addIssue({
          code: "custom",
          message: "A milestone can only depend on an earlier milestone.",
          path: ["milestones", index, "dependencyPosition"],
        });
      }
      previous = due;
    }
  });

export type AgreementInput = z.infer<typeof agreementInputSchema>;
