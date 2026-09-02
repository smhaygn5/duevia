import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export const env = {};",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Duevia global landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Duevia — Work in stages\. Settle globally\.<\/title>/i);
  assert.match(html, /Work in stages\./);
  assert.match(html, /Settle globally\./);
  assert.match(html, /Agree/);
  assert.match(html, /Fund/);
  assert.match(html, /Deliver/);
  assert.match(html, /Settle/);
  assert.match(html, /Arc Testnet/);
  assert.match(html, /duevia-logo-dark\.svg/);
  assert.match(html, /duevia-logo-light\.svg/);
  assert.match(html, /favicon\.ico\?v=3/);
  assert.match(html, /favicon\.svg\?v=3/);
  assert.match(html, /favicon-32x32\.png\?v=3/);
  assert.match(html, /apple-touch-icon\.png\?v=3/);
  assert.match(html, /Switch to light theme/);
  assert.match(html, /duevia-theme/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the working workspace dashboard", async () => {
  const response = await render("/app");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Good morning/);
  assert.match(html, /Review milestone/);
  assert.match(html, /Locked in escrow/);
  assert.match(html, /Arc Testnet/);
  assert.match(html, /Workspace home/);
  assert.match(html, /duevia-logo-dark\.svg/);
  assert.match(html, /Switch to light theme/);
});

test("server-renders the connected demo decision path", async () => {
  const [agreement, review, receipt, invitation] = await Promise.all([
    render("/app/agreements/dv-7k2p"),
    render("/app/agreements/dv-7k2p/review"),
    render("/app/receipts/demo"),
    render("/invite/demo"),
  ]);
  assert.equal(agreement.status, 200);
  assert.equal(review.status, 200);
  assert.equal(receipt.status, 200);
  assert.equal(invitation.status, 200);
  const agreementHtml = await agreement.text();
  assert.match(agreementHtml, /Global Product Launch/);
  assert.match(agreementHtml, /Dispute resolution room/);
  assert.match(agreementHtml, /wallet signed record/i);
  assert.match(await review.text(), /Approve milestone/);
  assert.match(await receipt.text(), /Demo receipt/);
  const invitationHtml = await invitation.text();
  assert.match(invitationHtml, /Invitation navigation/);
  assert.match(invitationHtml, /Workspace/);
  assert.match(invitationHtml, /duevia-logo-dark\.svg/);
  assert.match(invitationHtml, /Switch to light theme/);
});

test("starter skeleton is fully removed", async () => {
  const [page, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});
