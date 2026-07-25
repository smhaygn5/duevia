import { RecoveryPanel } from "@/components/recovery-panel";

export const metadata = {
  title: "Cancellation & recovery",
};

export default async function RecoveryPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <RecoveryPanel agreementRef={ref} />;
}
