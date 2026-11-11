import { z } from "zod";

/** Keeps validation feedback useful without exposing database, RPC, or storage internals. */
export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  return fallback;
}
