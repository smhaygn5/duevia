import { SubmissionForm } from "@/components/submission-form";

export const metadata = { title: "Submit milestone" };

export default async function SubmitMilestonePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <SubmissionForm agreementRef={ref} />;
}
