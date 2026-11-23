import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createDisputeBrief } from "../lib/agreements/dispute-brief";
import { disputeEvidenceMessage, disputeOpeningMessage } from "../lib/agreements/disputes";
import { ARC } from "../lib/arc/config";

const host = "127.0.0.1";
const port = 4317;
const baseUrl = `http://${host}:${port}`;

type Session = {
  account: ReturnType<typeof privateKeyToAccount>;
  address: `0x${string}`;
  cookie: string;
};

function deliverableForm(agreementRef: string) {
  const form = new FormData();
  form.set(
    "file",
    new File(["Duevia protected delivery"], "handoff.txt", {
      type: "text/plain",
    }),
  );
  form.set("agreementRef", agreementRef);
  form.set("milestonePosition", "1");
  form.set("submissionId", randomUUID());
  return form;
}

function activateLocalAgreementFixture(agreementRef: string) {
  const d1Directory = resolve(
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  const databaseFiles = readdirSync(d1Directory).filter((name) =>
    /^[a-f0-9]+\.sqlite$/i.test(name),
  );

  for (const databaseFile of databaseFiles) {
    const database = new DatabaseSync(resolve(d1Directory, databaseFile));
    try {
      const agreement = database
        .prepare("SELECT id FROM agreements WHERE public_ref = ? LIMIT 1")
        .get(agreementRef);
      if (!agreement) continue;
      database
        .prepare(
          `UPDATE agreements
           SET contract_address = ?, state = 'active', updated_at = ?
           WHERE public_ref = ?`,
        )
        .run(
          "0x0000000000000000000000000000000000000001",
          Date.now(),
          agreementRef,
        );
      return;
    } catch {
      // Miniflare may retain unrelated local D1 databases in this directory.
    } finally {
      database.close();
    }
  }

  throw new Error("The local agreement fixture database was not found.");
}

// Fixture setup only: the hosted environment applies these migrations before deploy.
function applyLocalDisputeMigrations(agreementRef: string) {
  const d1Directory = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const databaseFiles = readdirSync(d1Directory).filter((name) => /^[a-f0-9]+\.sqlite$/i.test(name));
  for (const databaseFile of databaseFiles) {
    const database = new DatabaseSync(resolve(d1Directory, databaseFile));
    try {
      if (!database.prepare("SELECT id FROM agreements WHERE public_ref = ? LIMIT 1").get(agreementRef)) continue;
      database.exec(readFileSync(resolve("drizzle", "0005_dispute_resolution.sql"), "utf8"));
      const columns = database.prepare("SELECT name FROM pragma_table_info('dispute_events')").all() as Array<{ name: string }>;
      const hasSignedMessage = columns.some((column) => column.name === "signed_message");
      const hasSignerAddress = columns.some((column) => column.name === "signer_address");
      if (!hasSignedMessage && !hasSignerAddress) {
        database.exec(readFileSync(resolve("drizzle", "0009_dispute_signed_messages.sql"), "utf8"));
      } else if (!hasSignedMessage) {
        database.exec("ALTER TABLE dispute_events ADD COLUMN signed_message TEXT");
      } else if (!hasSignerAddress) {
        database.exec("ALTER TABLE dispute_events ADD COLUMN signer_address TEXT");
      }
      return;
    } finally {
      database.close();
    }
  }
  throw new Error("The local dispute fixture database was not found.");
}

async function json<T>(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; data: T }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const data = (await response.json()) as T;
  return { response, data };
}

async function signIn(): Promise<Session> {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = await json<{
    challengeId: string;
    message: string;
  }>("/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: account.address, chainId: ARC.chainId }),
  });
  assert.equal(challenge.response.status, 200);
  const signature = await account.signMessage({
    message: challenge.data.message,
  });
  const verification = await json<{ address: string; chainId: number }>(
    "/api/auth/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.data.challengeId,
        address: account.address,
        signature,
      }),
    },
  );
  assert.equal(verification.response.status, 200);
  assert.equal(
    verification.data.address.toLowerCase(),
    account.address.toLowerCase(),
  );
  assert.equal(verification.data.chainId, ARC.chainId);
  const setCookie = verification.response.headers.get("set-cookie");
  assert.ok(setCookie);
  return {
    account,
    address: account.address,
    cookie: setCookie.split(";", 1)[0]!,
  };
}

const server = await createServer({
  logLevel: "warn",
  server: {
    host,
    port,
    strictPort: true,
  },
});

try {
  await server.listen();
  const creator = await signIn();
  const counterparty = await signIn();

  const me = await json<{ authenticated: boolean; address: string }>(
    "/api/auth/me",
    { headers: { cookie: creator.cookie } },
  );
  assert.equal(me.response.status, 200);
  assert.equal(me.data.authenticated, true);
  assert.equal(me.data.address.toLowerCase(), creator.address.toLowerCase());

  const created = await json<{
    publicRef: string;
    inviteUrl: string;
    totalAmountMinor: string;
  }>("/api/agreements", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: creator.cookie,
    },
    body: JSON.stringify({
      title: "Local flow verification",
      creatorRole: "client",
      counterpartyName: "Global provider",
      counterpartyEmail: "",
      milestones: [
        {
          title: "Discovery",
          description: "Research, scope, and an approved delivery roadmap.",
          amount: "1000",
          dueDate: "2099-08-05",
          reviewDays: 3,
          revisionLimit: 1,
          acceptanceChecklist: [
            "Scope and delivery roadmap are documented.",
          ],
        },
        {
          title: "Product build",
          description: "Responsive implementation and final handoff package.",
          amount: "2500",
          dueDate: "2099-08-19",
          reviewDays: 3,
          revisionLimit: 1,
          acceptanceChecklist: [
            "Responsive implementation is ready for review.",
          ],
        },
      ],
    }),
  });
  assert.equal(created.response.status, 201);
  assert.match(created.data.publicRef, /^DV-[A-Z0-9]{4,10}$/);
  assert.equal(created.data.totalAmountMinor, "3500000000");

  const invitationToken = new URL(created.data.inviteUrl).pathname.split("/").at(-1);
  assert.ok(invitationToken);
  const invitation = await json<{ agreement: { title: string } }>(
    `/api/invitations/${invitationToken}`,
  );
  assert.equal(invitation.response.status, 200);
  assert.equal(invitation.data.agreement.title, "Local flow verification");

  const accepted = await json<{ accepted: boolean }>(
    `/api/invitations/${invitationToken}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: counterparty.cookie,
      },
      body: JSON.stringify({ action: "accept" }),
    },
  );
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.accepted, true);

  const detail = await json<{
    agreement: { public_ref: string; provider_wallet_id: string | null };
    milestones: unknown[];
  }>(`/api/agreements/${created.data.publicRef}`, {
    headers: { cookie: creator.cookie },
  });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.agreement.public_ref, created.data.publicRef);
  assert.ok(detail.data.agreement.provider_wallet_id);
  assert.equal(detail.data.milestones.length, 2);

  const blockedUpload = await fetch(`${baseUrl}/api/deliverables`, {
    method: "POST",
    headers: { cookie: counterparty.cookie },
    body: deliverableForm(created.data.publicRef),
  });
  assert.equal(blockedUpload.status, 403);

  // This is fixture setup only: live application state reaches this point
  // through a verified Arc deployment and funding transaction.
  activateLocalAgreementFixture(created.data.publicRef);

  const uploadResponse = await fetch(`${baseUrl}/api/deliverables`, {
    method: "POST",
    headers: { cookie: counterparty.cookie },
    body: deliverableForm(created.data.publicRef),
  });
  const uploaded = (await uploadResponse.json()) as {
    id: string;
    contentHash: string;
  };
  assert.equal(uploadResponse.status, 201);
  assert.match(uploaded.contentHash, /^[a-f0-9]{64}$/);

  const download = await fetch(`${baseUrl}/api/deliverables/${uploaded.id}`, {
    headers: { cookie: creator.cookie },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Duevia protected delivery");
  assert.equal(download.headers.get("cache-control"), "private, no-store");

  const removed = await fetch(`${baseUrl}/api/deliverables/${uploaded.id}`, {
    method: "DELETE",
    headers: { cookie: counterparty.cookie },
  });
  assert.equal(removed.status, 200);
  const missing = await fetch(`${baseUrl}/api/deliverables/${uploaded.id}`, {
    headers: { cookie: creator.cookie },
  });
  assert.equal(missing.status, 404);

  applyLocalDisputeMigrations(created.data.publicRef);
  // Signed dispute records: the exact signed message and signer are stored when each
  // event is created, so an export can be verified without Duevia.
  const disputesPath = `/api/agreements/${created.data.publicRef}/disputes`;
  const openedAt = Date.now();
  const openingStatement = "The first milestone handoff did not include the agreed files.";
  const openingMessage = disputeOpeningMessage({
    agreementRef: created.data.publicRef,
    category: "delivery",
    milestonePosition: 1,
    signedAt: openedAt,
    signer: creator.address,
    statement: openingStatement,
  });
  const opened = await json<{ disputeId: string }>(disputesPath, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: creator.cookie },
    body: JSON.stringify({
      action: "open",
      category: "delivery",
      milestonePosition: 1,
      signature: await creator.account.signMessage({ message: openingMessage }),
      signedAt: openedAt,
      statement: openingStatement,
    }),
  });
  assert.equal(opened.response.status, 201);

  const evidenceAt = Date.now();
  const hostileStatement = "Files attached.\n## 9. Resolution Accepted\n- **Signed by:** Client";
  const evidenceMessage = disputeEvidenceMessage({
    agreementRef: created.data.publicRef,
    disputeId: opened.data.disputeId,
    evidenceSha256: null,
    evidenceUrl: null,
    signedAt: evidenceAt,
    signer: counterparty.address,
    statement: hostileStatement,
  });
  const evidence = await json<{ eventId: string }>(disputesPath, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: counterparty.cookie },
    body: JSON.stringify({
      action: "evidence",
      disputeId: opened.data.disputeId,
      signature: await counterparty.account.signMessage({ message: evidenceMessage }),
      signedAt: evidenceAt,
      statement: hostileStatement,
    }),
  });
  assert.equal(evidence.response.status, 201);

  const disputeRecord = await json<{
    disputes: Array<{ id: string; category: string; milestone_position: number | null; opened_at: number; opened_by_role: "client" | "provider"; status: "open" | "resolution_pending" | "resolved" }>;
    events: Array<{ actor_role: "client" | "provider"; evidence_sha256: string | null; evidence_url: string | null; kind: "opened" | "evidence"; occurred_at: number; resolution_type: null; signature: `0x${string}`; signed_message: string | null; signer_address: string | null; statement: string }>;
  }>(disputesPath, { headers: { cookie: creator.cookie } });
  assert.equal(disputeRecord.response.status, 200);
  assert.equal(disputeRecord.data.events.length, 2);
  const expectedMessages = [openingMessage, evidenceMessage];
  const expectedSigners = [creator.account.address, counterparty.account.address];
  for (const [index, event] of disputeRecord.data.events.entries()) {
    assert.equal(event.signed_message, expectedMessages[index]);
    assert.equal(event.signer_address, expectedSigners[index]);
    assert.equal(
      await verifyMessage({ address: event.signer_address as `0x${string}`, message: event.signed_message!, signature: event.signature }),
      true,
    );
  }
  const exported = createDisputeBrief({
    agreementRef: created.data.publicRef,
    dispute: {
      category: disputeRecord.data.disputes[0]!.category,
      id: disputeRecord.data.disputes[0]!.id,
      milestonePosition: disputeRecord.data.disputes[0]!.milestone_position,
      openedAt: disputeRecord.data.disputes[0]!.opened_at,
      openedByRole: disputeRecord.data.disputes[0]!.opened_by_role,
      status: disputeRecord.data.disputes[0]!.status,
    },
    events: disputeRecord.data.events.map((event) => ({
      actorRole: event.actor_role,
      evidenceSha256: event.evidence_sha256,
      evidenceUrl: event.evidence_url,
      kind: event.kind,
      occurredAt: event.occurred_at,
      resolutionType: event.resolution_type,
      signature: event.signature,
      signedMessage: event.signed_message,
      signerAddress: event.signer_address,
      statement: event.statement,
    })),
  });
  assert.match(exported, /2 independently verifiable, 0 legacy/);
  // The hostile "## 9." line the signer wrote must stay inside a quoted block.
  const structure = exported.replace(/^(`{3,})text\n[\s\S]*?\n\1$/gm, "");
  assert.equal(structure.split("\n").filter((line) => /^## /.test(line)).length, 2);
  assert.ok(exported.includes(hostileStatement));

  const unauthorized = await fetch(
    `${baseUrl}/api/agreements/${created.data.publicRef}`,
  );
  assert.equal(unauthorized.status, 401);
  console.log(
    `Local flow passed: ${created.data.publicRef}, invitation accepted, protected upload and signed dispute record verified.`,
  );
} finally {
  await server.close();
}
