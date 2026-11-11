import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { publicErrorMessage } from "../lib/http/public-error";

test("public API errors keep input feedback but hide infrastructure detail", () => {
  const validationError = z.object({ title: z.string().min(4) }).safeParse({ title: "x" }).error;
  assert.ok(validationError);
  assert.notEqual(publicErrorMessage(validationError, "Request failed."), "Request failed.");
  assert.equal(
    publicErrorMessage(new Error("D1_ERROR: table sessions is unavailable"), "Request failed."),
    "Request failed.",
  );
});
