import { AppHeader } from "@/components/app-header";
import { AgreementForm } from "@/components/agreement-form";
import { Suspense } from "react";

export const metadata = { title: "Create agreement" };

export default function CreateAgreementPage() {
  return (
    <>
      <AppHeader
        eyebrow="New agreement"
        title="Set the work up for clarity."
        description="Create sequential milestones, then share one private invitation."
      />
      <Suspense
        fallback={
          <section className="panel" aria-live="polite">
            <p className="muted">Preparing the agreement workspace…</p>
          </section>
        }
      >
        <AgreementForm />
      </Suspense>
    </>
  );
}
