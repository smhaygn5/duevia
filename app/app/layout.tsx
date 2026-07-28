import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceBar } from "@/components/workspace-bar";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="product-shell">
      <AppSidebar />
      <main className="product-main">
        <WorkspaceBar />
        {children}
      </main>
    </div>
  );
}
