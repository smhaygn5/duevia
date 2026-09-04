"use client";

import { ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
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
  updated_at: number;
};

type AgreementSort = "recent" | "value" | "title";

export function AgreementsList() {
  const wallet = useWallet();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<AgreementSort>("recent");
  const [result, setResult] = useState<{
    address: string;
    agreements: ApiAgreement[];
  } | null>(null);

  useEffect(() => {
    if (!wallet.authenticated || !wallet.address) return;
    let active = true;
    const address = wallet.address;
    void fetch("/api/agreements", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { agreements?: ApiAgreement[] })
          : null,
      )
      .then((data) => {
        if (active && data?.agreements) {
          setResult({ address, agreements: data.agreements });
        }
      });
    return () => {
      active = false;
    };
  }, [wallet.address, wallet.authenticated]);

  const currentResult =
    wallet.authenticated && wallet.address === result?.address ? result : null;
  const loading = wallet.authenticated && !currentResult;
  const all = useMemo(
    () =>
      wallet.authenticated
        ? (currentResult?.agreements ?? []).map((agreement) => ({
            ref: agreement.public_ref,
            title: agreement.title,
            counterparty: agreement.counterparty_name,
            total: formatUnits(BigInt(agreement.total_amount_minor), 6),
            status: agreement.state
              .split("_")
              .map((word) => word[0]?.toUpperCase() + word.slice(1))
              .join(" "),
            milestones: agreement.milestone_count,
            amountMinor: BigInt(agreement.total_amount_minor),
            updatedAt: agreement.updated_at,
            saved: true,
          }))
        : demoAgreements.map((agreement) => ({
            ref: agreement.publicRef,
            title: agreement.title,
            counterparty:
              agreement.provider === "Orbit Studio"
                ? agreement.client
                : agreement.provider,
            total: agreement.total,
            status: agreement.status,
            milestones: 3,
            amountMinor: BigInt(agreement.total.replaceAll(",", "")) * 1_000_000n,
            updatedAt: 0,
            saved: false,
          })),
    [currentResult, wallet.authenticated],
  );

  const visible = useMemo(() => all
    .filter((agreement) => {
      const searchMatch = `${agreement.title} ${agreement.ref} ${agreement.counterparty}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const filterMatch = filter === "All" || agreement.status.toLowerCase().includes(filter.toLowerCase());
      return searchMatch && filterMatch;
    })
    .sort((left, right) => {
      if (sort === "value") return left.amountMinor === right.amountMinor ? 0 : left.amountMinor > right.amountMinor ? -1 : 1;
      if (sort === "title") return left.title.localeCompare(right.title);
      return right.updatedAt - left.updatedAt;
    }), [all, filter, query, sort]);
  const filtersActive = filter !== "All" || Boolean(query.trim()) || sort !== "recent";

  function clearOrganizer() {
    setQuery("");
    setFilter("All");
    setSort("recent");
  }

  return (
    <>
      <div
        className={`workspace-disclosure ${
          wallet.authenticated
            ? "workspace-disclosure-verified"
            : "workspace-disclosure-demo"
        }`}
      >
        <strong>
          {wallet.authenticated ? "Your persisted agreements" : "Guided demo"}
        </strong>
        <span>
          {wallet.authenticated
            ? "Only agreements linked to your signed-in Arc Testnet wallet are shown."
            : "These sample agreements use fictional parties and no real funds."}
        </span>
      </div>
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
      <div className="agreement-organizer-meta">
        <span>{loading ? "Loading agreements" : `${visible.length} ${visible.length === 1 ? "agreement" : "agreements"} shown`}</span>
        <label className="agreement-sort">
          <SlidersHorizontal size={14} />
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as AgreementSort)} aria-label="Sort agreements">
            <option value="recent">Most recent</option>
            <option value="value">Highest value</option>
            <option value="title">A to Z</option>
          </select>
        </label>
        {filtersActive && <button className="agreement-clear" type="button" onClick={clearOrganizer}><X size={13} /> Clear organizer</button>}
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
        {!visible.length && (
          <div className="empty-state">
            {loading
              ? "Loading your agreements…"
              : wallet.authenticated
                ? "No real agreements yet. Create one to start."
                : "No demo agreements match this search."}
          </div>
        )}
      </div>
    </>
  );
}
