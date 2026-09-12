import type { DeadlineRisk } from "./deadline-risk";

export type ScheduleFilter = "all" | "attention" | "upcoming";
export type ScheduleWindow = "all" | "next" | "following" | "later";

export function filterScheduledMilestones(
  items: DeadlineRisk[],
  filter: ScheduleFilter,
) {
  if (filter === "attention") return items.filter((item) => item.level === "high" || item.level === "medium");
  if (filter === "upcoming") return items.filter((item) => item.level === "low");
  return items;
}

export function filterScheduleWindow(
  items: DeadlineRisk[],
  window: ScheduleWindow,
  now = Date.now(),
) {
  if (window === "all") return items;
  const oneWeek = 7 * 24 * 60 * 60 * 1_000;
  const nextWeek = now + oneWeek;
  const followingWeek = now + 2 * oneWeek;
  if (window === "next") return items.filter((item) => item.dueAt <= nextWeek);
  if (window === "following") return items.filter((item) => item.dueAt > nextWeek && item.dueAt <= followingWeek);
  return items.filter((item) => item.dueAt > followingWeek);
}

export function groupMilestonesByDate(items: DeadlineRisk[]) {
  return items.reduce<Array<{ date: number; items: DeadlineRisk[] }>>((groups, item) => {
    const date = new Date(item.dueAt);
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const current = groups.at(-1);
    if (current?.date === day) current.items.push(item);
    else groups.push({ date: day, items: [item] });
    return groups;
  }, []);
}
