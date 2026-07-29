import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";

test("production responses include the Duevia security header policy", async () => {
  assert.equal(nextConfig.poweredByHeader, false);
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers!();
  const globalRule = rules.find((rule) => rule.source === "/:path*");
  assert.ok(globalRule);

  const headers = new Map(
    globalRule.headers.map((header) => [
      header.key.toLowerCase(),
      header.value,
    ]),
  );
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.match(
    headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.match(
    headers.get("permissions-policy") ?? "",
    /camera=\(\)/,
  );
});
