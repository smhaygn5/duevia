export {};

declare global {
  interface Env {
    DB: D1Database;
    DELIVERABLES: R2Bucket;
  }
}
