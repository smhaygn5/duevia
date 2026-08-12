import assert from "node:assert/strict";
import test from "node:test";
import { getSubmissionVersions } from "../lib/agreements/versioned-deliverables";

test("submission versions preserve chronological numbering and show latest first", () => {
  const versions = getSubmissionVersions(
    [
      { id: "second", milestone_position: 2, submitted_at: 200, note: null },
      { id: "first", milestone_position: 2, submitted_at: 100, note: null },
      { id: "other", milestone_position: 1, submitted_at: 300, note: null },
    ],
    2,
  );

  assert.deepEqual(
    versions.map(({ id, version, isLatest }) => ({ id, version, isLatest })),
    [
      { id: "second", version: 2, isLatest: true },
      { id: "first", version: 1, isLatest: false },
    ],
  );
});
