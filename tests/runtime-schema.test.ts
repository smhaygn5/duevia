import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ensureRuntimeSchema, setRuntimeBindings } from "../db/runtime";

type Row = Record<string, unknown>;

/** Minimal D1 adapter over node:sqlite so the real runtime schema code can run in a unit test. */
function d1(database: DatabaseSync) {
  function statement(sql: string, args: unknown[] = []) {
    return {
      args,
      bind: (...next: unknown[]) => statement(sql, next),
      all: async () => ({ results: database.prepare(sql).all(...(args as never[])) as Row[] }),
      first: async () => (database.prepare(sql).get(...(args as never[])) as Row | undefined) ?? null,
      run: async () => {
        const result = database.prepare(sql).run(...(args as never[]));
        return { meta: { changes: Number(result.changes) }, success: true };
      },
      sql,
    };
  }
  return {
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
      for (const item of statements) await item.run();
      return [];
    },
    prepare: (sql: string) => statement(sql),
  };
}

test("runtime schema adds signed message columns to a legacy dispute table and keeps old events", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE wallets (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE auth_challenges (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE wallet_sessions (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE agreements (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE milestones (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE deliverables (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE activities (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE api_rate_limits (key TEXT PRIMARY KEY NOT NULL);
  `);
  database.exec(readFileSync(new URL("../drizzle/0005_dispute_resolution.sql", import.meta.url), "utf8"));
  database.exec("INSERT INTO wallets (id) VALUES ('w1'); INSERT INTO agreements (id) VALUES ('a1');");
  database.exec(`INSERT INTO disputes (id, agreement_id, opened_by_wallet_id, category, status, opened_at, updated_at)
    VALUES ('d1', 'a1', 'w1', 'delivery', 'open', 1, 1)`);
  database.exec(`INSERT INTO dispute_events (id, dispute_id, actor_wallet_id, kind, statement, signature, occurred_at)
    VALUES ('legacy', 'd1', 'w1', 'opened', 'Old record', '0x01', 1)`);

  setRuntimeBindings({ DB: d1(database) as never });
  await ensureRuntimeSchema();

  const columns = database.prepare("SELECT name FROM pragma_table_info('dispute_events')").all().map((row) => String((row as Row).name));
  assert.ok(columns.includes("signed_message"));
  assert.ok(columns.includes("signer_address"));
  const legacy = database.prepare("SELECT statement, signed_message, signer_address FROM dispute_events WHERE id = 'legacy'").get() as Row;
  assert.equal(legacy.statement, "Old record");
  assert.equal(legacy.signed_message, null);
  assert.equal(legacy.signer_address, null);
  database.close();
});
