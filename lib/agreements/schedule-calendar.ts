import type { DeadlineRisk } from "./deadline-risk";

function formatCalendarTime(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeCalendarValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
}

export function milestoneScheduleCalendar(items: DeadlineRisk[], generatedAt = Date.now()) {
  const events = items.flatMap((item, index) => [
    "BEGIN:VEVENT",
    `UID:${escapeCalendarValue(`${item.agreementRef}-${item.dueAt}-${index}@duevia`)}`,
    `DTSTAMP:${formatCalendarTime(generatedAt)}`,
    `DTSTART:${formatCalendarTime(item.dueAt)}`,
    `SUMMARY:${escapeCalendarValue(`${item.title} · ${item.agreementRef}`)}`,
    `DESCRIPTION:${escapeCalendarValue(`${item.action} (${item.label})`)}`,
    "END:VEVENT",
  ]);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Duevia//Milestone Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
