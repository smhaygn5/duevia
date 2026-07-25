import { Plus } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AgreementsList } from "@/components/agreements-list";

export const metadata = { title: "Agreements" };

export default function AgreementsPage() {
  return (
    <>
      <AppHeader
        eyebrow="Workspace"
        title="Agreements"
        description="Every scope, milestone, delivery, and settlement in one place."
        action={
          <Link className="button button-primary" href="/app/agreements/new">
            <Plus size={16} />
            Create agreement
          </Link>
        }
      />
      <AgreementsList />
    </>
  );
}
