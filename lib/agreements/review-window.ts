export type ReviewWindowState = "open" | "closing" | "expired";

export type ReviewWindow = {
  closesAt: number;
  remainingMs: number;
  state: ReviewWindowState;
  label: string;
  detail: string;
};

const hour = 60 * 60 * 1_000;
const day = 24 * hour;

export function reviewWindow(
  submittedAt: number,
  reviewWindowSeconds: number,
  now = Date.now(),
): ReviewWindow {
  const closesAt = submittedAt + reviewWindowSeconds * 1_000;
  const remainingMs = closesAt - now;
  const state: ReviewWindowState = remainingMs <= 0 ? "expired" : remainingMs <= 24 * hour ? "closing" : "open";
  const absolute = Math.abs(remainingMs);
  const days = Math.floor(absolute / day);
  const hours = Math.floor((absolute % day) / hour);
  const minutes = Math.floor((absolute % hour) / (60 * 1_000));
  const duration = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(minutes, 0)}m`;

  return {
    closesAt,
    remainingMs,
    state,
    label: state === "expired" ? `Closed ${duration} ago` : `${duration} remaining`,
    detail:
      state === "expired"
        ? "Review timing has passed. Confirm the agreement state before taking any action."
        : state === "closing"
          ? "This review window closes within 24 hours."
          : "Review the delivery and acceptance criteria before settlement.",
  };
}
