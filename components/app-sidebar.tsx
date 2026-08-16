"use client";

import {
  Activity,
  BellRing,
  FileText,
  ReceiptText,
  LayoutDashboard,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DueviaLogo } from "./duevia-logo";

const links = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/agreements", label: "Agreements", icon: FileText },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/actions", label: "Action Center", icon: BellRing },
  { href: "/app/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="product-sidebar">
      <Link
        className="wordmark"
        href="/app"
        aria-label="Duevia workspace home"
      >
        <DueviaLogo compactOnMobile />
      </Link>

      <Link className="sidebar-create" href="/app/agreements/new">
        <Plus size={16} />
        Create agreement
      </Link>

      <nav aria-label="Workspace navigation">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app"
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}>
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-network">
        <span className="status-dot" />
        <div>
          <strong>Arc Testnet</strong>
          <small>Chain 5042002</small>
        </div>
      </div>
    </aside>
  );
}
