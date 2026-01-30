/**
 * API Fallback Logger
 *
 * Tracks when REST API calls fail and we fall back to MotherDuck.
 * This data can be exported to report issues to the API team.
 *
 * Key Issue: Coal plant API uses compound IDs (L{location}_G{unit})
 * but the app queries with just G{unit} prefix IDs.
 * Coal mines (M-prefix) work fine with simple IDs.
 */

import { writable, get } from 'svelte/store';

export interface FallbackEvent {
  assetId: string;
  assetName?: string;
  apiError: string;
  fallbackSource: 'motherduck' | 'none';
  fallbackSuccess: boolean;
  timestamp: string;
  url: string;
}

// Store for fallback events (persists in memory during session)
export const fallbackLog = writable<FallbackEvent[]>([]);

// Add a fallback event
export function logApiFallback(event: Omit<FallbackEvent, 'timestamp' | 'url'>) {
  const fullEvent: FallbackEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
  };

  fallbackLog.update((log) => [...log, fullEvent]);

  // Also log to console for immediate visibility
  console.warn('[API FALLBACK LOGGED]', fullEvent);

  return fullEvent;
}

// Get all logged events
export function getFallbackLog(): FallbackEvent[] {
  return get(fallbackLog);
}

// Clear the log
export function clearFallbackLog() {
  fallbackLog.set([]);
}

// Export log as JSON for reporting
export function exportFallbackLog(): string {
  const events = get(fallbackLog);
  const report = {
    exportedAt: new Date().toISOString(),
    totalEvents: events.length,
    uniqueAssets: [...new Set(events.map((e) => e.assetId))],
    summary: {
      totalFallbacks: events.length,
      successfulFallbacks: events.filter((e) => e.fallbackSuccess).length,
      failedFallbacks: events.filter((e) => !e.fallbackSuccess).length,
    },
    knownIssue:
      'Coal plant API uses compound IDs (L{location}_G{unit}) but app queries with G{unit} only. Coal mines (M-prefix) work fine.',
    suggestedFix: 'API should support G-prefix lookup like it does for M-prefix coal mines',
    events,
  };

  return JSON.stringify(report, null, 2);
}

// Download log as file
export function downloadFallbackLog() {
  const json = exportFallbackLog();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `api-fallback-report-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
