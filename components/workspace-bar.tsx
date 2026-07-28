"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

function workspaceLocation(pathname: string) {
  if (pathname === "/app") return "Overview";
  if (pathname === "/app/agreements") return "Agreements";
  if (pathname === "/app/agreements/new") return "New agreement";
  if (pathname.endsWith("/fund")) return "Funding";
  if (pathname.endsWith("/submit")) return "Submission";
  if (pathname.endsWith("/review")) return "Review";
  if (pathname.endsWith("/recovery")) return "Recovery";
  if (pathname.startsWith("/app/agreements/")) return "Agreement";
  if (pathname.startsWith("/app/activity")) return "Activity";
  if (pathname.startsWith("/app/settings")) return "Settings";
  if (pathname.startsWith("/app/receipts")) return "Receipt";
  return "Workspace";
}

export function WorkspaceBar() {
  const pathname = usePathname();

  return (
    <div className="workspace-bar">
      <div className="workspace-bar-location">
        <Link href="/app" aria-label="Go to workspace home">
          <Home size={15} />
          <span>Workspace home</span>
        </Link>
        <span aria-hidden="true">/</span>
        <strong>{workspaceLocation(pathname)}</strong>
      </div>
      <WalletButton />
    </div>
  );
}
