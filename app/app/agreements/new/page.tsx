import { AppHeader } from "@/components/app-header";
import { AgreementForm } from "@/components/agreement-form";

export const metadata = { title: "Create agreement" };

export default function CreateAgreementPage() {
  return (
    <>
      <AppHeader
        eyebrow="New agreement"
        title="Set the work up for clarity."
        description="Create sequential milestones, then share one private invitation."
      />
      <AgreementForm />
    </>
  );
}
