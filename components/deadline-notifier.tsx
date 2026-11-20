"use client";

import { useEffect, useState } from "react";
import { deadlineAlerts, unseenDeadlineAlerts } from "@/lib/agreements/deadline-alerts";
import { loadVerifiedDashboard } from "@/lib/dashboard-client";
import { loadWorkspacePreferences, preferencesChangedEvent, type WorkspacePreferences } from "@/lib/workspace-preferences";
import { useWallet } from "./wallet-provider";

function readSentAlerts(storageKey: string) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function DeadlineNotifier() {
  const wallet = useWallet();
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => loadWorkspacePreferences());

  useEffect(() => {
    const refreshPreferences = () => setPreferences(loadWorkspacePreferences());
    window.addEventListener(preferencesChangedEvent, refreshPreferences);
    window.addEventListener("storage", refreshPreferences);
    return () => {
      window.removeEventListener(preferencesChangedEvent, refreshPreferences);
      window.removeEventListener("storage", refreshPreferences);
    };
  }, []);

  useEffect(() => {
    if (!wallet.authenticated || !wallet.address || !preferences.browserAlerts || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let cancelled = false;
    const storageKey = `duevia-deadline-alerts:${wallet.address}`;

    void loadVerifiedDashboard().then((dashboard) => {
      if (cancelled) return;
      const sent = readSentAlerts(storageKey);
      const next = unseenDeadlineAlerts(deadlineAlerts(dashboard.deadlineRisks, preferences.alerts), sent);
      const nextIds = [...sent];
      for (const alert of next) {
        try {
          new Notification("Duevia deadline", { body: `${alert.title}\n${alert.body}`, tag: alert.id });
          nextIds.push(alert.id);
        } catch {
          // Browser or operating-system notification delivery can fail independently.
        }
      }
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(nextIds.slice(-100)));
      } catch {
        // Notification delivery still works for this page session.
      }
    }).catch(() => {
      // Background reminders never interrupt the current workspace task.
    });
    return () => { cancelled = true; };
  }, [preferences.alerts, preferences.browserAlerts, wallet.address, wallet.authenticated]);

  return null;
}
