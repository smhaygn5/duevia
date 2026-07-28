import {
  ArrowRight,
  Check,
  CircleDollarSign,
  FileCheck2,
  Globe2,
  LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { ArcFoundationStatus } from "@/components/arc-foundation-status";
import { DueviaLogo } from "@/components/duevia-logo";

const steps = [
  {
    number: "01",
    title: "Agree",
    description: "Turn scope, timing, and revisions into clear milestones.",
  },
  {
    number: "02",
    title: "Fund",
    description: "Lock the full agreement value in USDC on Arc.",
  },
  {
    number: "03",
    title: "Deliver",
    description: "Submit proof and deliverables against each milestone.",
  },
  {
    number: "04",
    title: "Settle",
    description: "Release approved work with a transparent audit trail.",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="Duevia home">
          <DueviaLogo priority />
        </Link>
        <div className="nav-links">
          <a href="#workflow">How it works</a>
          <a href="#foundation">Built on Arc</a>
        </div>
        <Link className="button button-quiet" href="/app">
          Open workspace
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            Milestone agreements, settled globally
          </div>
          <h1>
            Work in stages.
            <br />
            <span>Settle globally.</span>
          </h1>
          <p>
            Duevia gives clients and independent teams one place to agree,
            fund, deliver, and settle milestone-based work in USDC.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/app">
              Create an agreement
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="text-link" href="#workflow">
              Explore the flow
            </a>
          </div>
          <div className="trust-row" aria-label="Product principles">
            <span>
              <Check size={15} /> Clear terms
            </span>
            <span>
              <Check size={15} /> Onchain settlement
            </span>
            <span>
              <Check size={15} /> Global by default
            </span>
          </div>
        </div>

        <div className="agreement-preview" aria-label="Agreement preview">
          <div className="preview-topline">
            <span>Agreement DV-2048</span>
            <span className="pill pill-live">Active</span>
          </div>
          <div className="preview-heading">
            <div>
              <p>Brand system delivery</p>
              <span>3 milestones · funded in USDC</span>
            </div>
            <strong>$12,800</strong>
          </div>
          <div className="progress-track" aria-label="66 percent complete">
            <span />
          </div>
          <div className="milestone-list">
            <div className="milestone-row complete">
              <span className="milestone-state">
                <Check size={14} />
              </span>
              <div>
                <strong>Research and direction</strong>
                <small>Released</small>
              </div>
              <b>$3,200</b>
            </div>
            <div className="milestone-row active">
              <span className="milestone-state">02</span>
              <div>
                <strong>Identity system</strong>
                <small>Under review</small>
              </div>
              <b>$5,600</b>
            </div>
            <div className="milestone-row">
              <span className="milestone-state">03</span>
              <div>
                <strong>Launch handoff</strong>
                <small>Up next</small>
              </div>
              <b>$4,000</b>
            </div>
          </div>
          <div className="preview-footer">
            <LockKeyhole size={15} aria-hidden="true" />
            Remaining funds are locked on Arc
          </div>
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <p className="eyebrow">A calmer way to work together</p>
          <h2>From agreement to settlement, every step has a clear owner.</h2>
          <p>
            The flow is built around real service work: scoped milestones,
            review windows, limited revisions, and verifiable releases.
          </p>
        </div>
        <div className="workflow-grid">
          {steps.map((step) => (
            <article key={step.number} className="workflow-card">
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="foundation-section" id="foundation">
        <div className="foundation-copy">
          <p className="eyebrow">Built for real global work</p>
          <h2>Stable settlement without hiding the agreement.</h2>
          <p>
            Duevia keeps business context offchain and puts only the settlement
            logic and proofs where they belong. The result is private enough for
            work, transparent enough for trust.
          </p>
          <div className="principle-grid">
            <div>
              <CircleDollarSign size={20} />
              <strong>USDC-native</strong>
              <span>Predictable milestone values and Arc gas.</span>
            </div>
            <div>
              <FileCheck2 size={20} />
              <strong>Proof-led</strong>
              <span>Every submission and release leaves an audit trail.</span>
            </div>
            <div>
              <Globe2 size={20} />
              <strong>Borderless</strong>
              <span>No country is the default; every team is global.</span>
            </div>
          </div>
        </div>
        <ArcFoundationStatus />
      </section>
    </main>
  );
}
