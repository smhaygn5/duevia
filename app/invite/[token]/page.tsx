import { InvitationView } from "@/components/invitation-view";

export const metadata = { title: "Agreement invitation" };

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InvitationView token={token} />;
}
