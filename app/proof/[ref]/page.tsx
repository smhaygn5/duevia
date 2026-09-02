import { PublicProofPage } from "@/components/public-proof-page";

export const metadata = { title: "Agreement proof" };

export default async function ProofPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <PublicProofPage agreementRef={ref} />;
}
