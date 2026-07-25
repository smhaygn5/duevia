import { ReviewPanel } from "@/components/review-panel";

export const metadata = {
  title: "Review delivery",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  return <ReviewPanel agreementRef={ref} />;
}
