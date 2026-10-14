import posthog from "posthog-js";

const APP_SLUG = "babel-room";
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY ?? "";

let enabled = false;

function isLocalhost(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "0.0.0.0"
  );
}

/**
 * Initialise PostHog. Skipped in dev builds and on localhost unless
 * VITE_POSTHOG_DEV=1 is set (e.g. in apps/web/.env.local).
 * Events go through the Worker's /ingest reverse proxy so ad blockers don't drop them.
 */
export function initAnalytics(): void {
  if (!POSTHOG_KEY) return;
  if (
    (import.meta.env.DEV || isLocalhost()) &&
    import.meta.env.VITE_POSTHOG_DEV !== "1"
  )
    return;

  posthog.init(POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    autocapture: true,
    enable_heatmaps: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    session_recording: { maskAllInputs: true },
  });
  posthog.register({ app: APP_SLUG });
  enabled = true;
}

export type AnalyticsEvent =
  | "room_created"
  | "room_joined"
  | "room_join_failed"
  | "invite_link_copied"
  | "call_ended"
  | "summary_viewed"
  | "summary_copied";

export function track(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (!enabled) return;
  posthog.capture(event, properties);
}
