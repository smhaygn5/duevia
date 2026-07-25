import { ReceiptCard } from "@/components/receipt-card";

export const metadata = {
  title: "Settlement receipt",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptCard receiptId={id} />;
}
