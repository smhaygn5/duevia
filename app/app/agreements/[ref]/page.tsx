import { AgreementDetail } from "@/components/agreement-detail";

export const metadata = { title: "Agreement" };

export default async function AgreementPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <AgreementDetail agreementRef={ref} />;
}
