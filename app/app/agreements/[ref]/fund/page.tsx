import { FundingPanel } from "@/components/funding-panel";

export const metadata = { title: "Fund agreement" };

export default async function FundingPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <FundingPanel agreementRef={ref} />;
}
