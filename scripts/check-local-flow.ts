import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC } from "../lib/arc/config";

const host = "127.0.0.1";
const port = 4317;
const baseUrl = `http://${host}:${port}`;

type Session = {
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
        },
        {
          title: "Product build",
          description: "Responsive implementation and final handoff package.",
          amount: "2500",
          dueDate: "2099-08-19",
          reviewDays: 3,
          revisionLimit: 1,
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

  const dashboard = await json<{
    source: string;
    summary: {
      activeAgreements: number;
      totalAgreements: number;
      lockedMinor: string;
      releasedMinor: string;
      verifiedEvents: number;
    };
    agreements: Array<{ public_ref: string }>;
    activities: Array<{ type: string }>;
  }>("/api/dashboard", {
    headers: { cookie: creator.cookie },
  });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.data.source, "arc-verified");
  assert.equal(dashboard.data.summary.activeAgreements, 1);
  assert.equal(dashboard.data.summary.totalAgreements, 1);
  assert.equal(dashboard.data.summary.lockedMinor, "3500000000");
  assert.equal(dashboard.data.summary.releasedMinor, "0");
  assert.equal(dashboard.data.summary.verifiedEvents, 0);
  assert.ok(
    dashboard.data.agreements.some(
      (agreement) => agreement.public_ref === created.data.publicRef,
    ),
  );
  assert.ok(
    dashboard.data.activities.some(
      (activity) => activity.type === "agreement.created",
    ),
  );

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

  const unauthorized = await fetch(
    `${baseUrl}/api/agreements/${created.data.publicRef}`,
  );
  assert.equal(unauthorized.status, 401);
  const unauthorizedDashboard = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(unauthorizedDashboard.status, 401);

  console.log(
    `Local flow passed: ${created.data.publicRef}, verified dashboard, invitation, and protected upload.`,
  );
} finally {
  await server.close();
}
