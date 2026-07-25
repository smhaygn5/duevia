import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="product-shell">
      <AppSidebar />
      <main className="product-main">{children}</main>
    </div>
  );
}
