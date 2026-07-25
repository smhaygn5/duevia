"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { demoAgreements } from "@/lib/demo-data";
import { StatusBadge } from "./status-badge";
import { useWallet } from "./wallet-provider";

type ApiAgreement = {
  public_ref: string;
  title: string;
  state: string;
  total_amount_minor: string;
  counterparty_name: string;
  creator_role: "client" | "provider";
  milestone_count: number;
};

export function AgreementsList() {
  const wallet = useWallet();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [saved, setSaved] = useState<ApiAgreement[]>([]);

  useEffect(() => {
    if (!wallet.authenticated) return;
    void fetch("/api/agreements", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { agreements?: ApiAgreement[] })
          : null,
      )
      .then((data) => {
        if (data?.agreements) setSaved(data.agreements);
      });
  }, [wallet.authenticated]);

  const all = useMemo(
    () => [
      ...(wallet.authenticated ? saved : []).map((agreement) => ({
        ref: agreement.public_ref,
        title: agreement.title,
        counterparty: agreement.counterparty_name,
        total: formatUnits(BigInt(agreement.total_amount_minor), 6),
        status: agreement.state
          .split("_")
          .map((word) => word[0]?.toUpperCase() + word.slice(1))
          .join(" "),
        milestones: agreement.milestone_count,
        saved: true,
      })),
      ...demoAgreements.map((agreement) => ({
        ref: agreement.publicRef,
        title: agreement.title,
        counterparty:
          agreement.provider === "Orbit Studio"
            ? agreement.client
            : agreement.provider,
        total: agreement.total,
        status: agreement.status,
        milestones: 3,
        saved: false,
      })),
    ],
    [saved, wallet.authenticated],
  );

  const visible = all.filter((agreement) => {
    const searchMatch = `${agreement.title} ${agreement.ref} ${agreement.counterparty}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const filterMatch =
      filter === "All" ||
      agreement.status.toLowerCase().includes(filter.toLowerCase());
    return searchMatch && filterMatch;
  });

  return (
    <>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Search agreements</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by agreement or counterparty"
          />
        </label>
        <div className="filter-tabs" role="group" aria-label="Filter agreements">
          {["All", "Active", "Awaiting", "Completed"].map((option) => (
            <button
              key={option}
              type="button"
              className={filter === option ? "active" : ""}
              onClick={() => setFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="agreement-card-list">
        {visible.map((agreement) => (
          <Link
            key={`${agreement.saved ? "saved" : "demo"}-${agreement.ref}`}
            className="agreement-list-card"
            href={`/app/agreements/${agreement.ref.toLowerCase()}`}
          >
            <div className="agreement-list-main">
              <span>{agreement.ref}</span>
              <h2>{agreement.title}</h2>
              <p>{agreement.counterparty}</p>
            </div>
            <div className="agreement-list-meta">
              <div>
                <span>Total</span>
                <strong>{agreement.total} USDC</strong>
              </div>
              <div>
                <span>Milestones</span>
                <strong>{agreement.milestones}</strong>
              </div>
              <StatusBadge status={agreement.status} />
            </div>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
