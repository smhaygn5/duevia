import assert from "node:assert/strict";
import test from "node:test";
import { milestoneScheduleCalendar } from "../lib/agreements/schedule-calendar";

test("milestone calendar exports UTC events and escapes calendar content", () => {
  const calendar = milestoneScheduleCalendar([{
    agreementRef: "DV,ONE",
    title: "Review; launch\\handoff",
    dueAt: Date.UTC(2026, 8, 3, 9, 5),
    state: "submitted",
    currentRole: "client",
    level: "medium",
    label: "Due soon",
    action: "Review notes\nand confirm",
  }], Date.UTC(2026, 8, 1));
  assert.match(calendar, /BEGIN:VCALENDAR\r\nVERSION:2.0/);
  assert.match(calendar, /DTSTART:20260903T090500Z/);
  assert.match(calendar, /SUMMARY:Review\\; launch\\\\handoff · DV\\,ONE/);
  assert.match(calendar, /DESCRIPTION:Review notes\\nand confirm \(Due soon\)/);
  assert.match(calendar, /END:VCALENDAR\r\n$/);
});
