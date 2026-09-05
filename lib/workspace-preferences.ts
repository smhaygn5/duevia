export type TimeReference = "utc" | "local";

export type WorkspacePreferences = {
  workspaceName: string;
  email: string;
  alerts: "important" | "all" | "none";
  timeReference: TimeReference;
};

const storageKey = "duevia-workspace-preferences";
export const preferencesChangedEvent = "duevia-workspace-preferences-change";

export const defaultWorkspacePreferences: WorkspacePreferences = {
  workspaceName: "Duevia workspace",
  email: "",
  alerts: "important",
  timeReference: "utc",
};

export function loadWorkspacePreferences(): WorkspacePreferences {
  if (typeof window === "undefined") return defaultWorkspacePreferences;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultWorkspacePreferences;
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>;
    return {
      workspaceName: typeof parsed.workspaceName === "string" ? parsed.workspaceName : defaultWorkspacePreferences.workspaceName,
      email: typeof parsed.email === "string" ? parsed.email : defaultWorkspacePreferences.email,
      alerts: parsed.alerts === "all" || parsed.alerts === "none" ? parsed.alerts : "important",
      timeReference: parsed.timeReference === "local" ? "local" : "utc",
    };
  } catch {
    return defaultWorkspacePreferences;
  }
}

export function saveWorkspacePreferences(preferences: WorkspacePreferences) {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  window.dispatchEvent(new Event(preferencesChangedEvent));
}

export function formatWorkspaceDate(timestamp: number, timeReference: TimeReference) {
  return new Date(timestamp).toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(timeReference === "utc" ? { timeZone: "UTC" } : {}),
  });
}

export function formatWorkspaceTime(timestamp: number, timeReference: TimeReference) {
  return new Date(timestamp).toLocaleTimeString("en", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeReference === "utc" ? { timeZone: "UTC" } : {}),
  });
}
