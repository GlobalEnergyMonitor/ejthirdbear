/** Thin Matomo analytics wrapper. No-ops when env vars are unset or during SSR. */

const url = import.meta.env.VITE_MATOMO_URL as string | undefined;
const siteId = import.meta.env.VITE_MATOMO_SITE_ID as string | undefined;
const enabled = typeof window !== 'undefined' && !!url && !!siteId;

function paq(): Array<unknown[]> {
  if (!enabled) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w._paq = w._paq || [];
  return w._paq;
}

/** Inject Matomo tracking script. Call once in root layout onMount. */
export function initAnalytics(): void {
  if (!enabled) return;
  const q = paq();
  q.push(['enableLinkTracking']);
  q.push(['setTrackerUrl', `${url}/matomo.php`]);
  q.push(['setSiteId', siteId]);

  const script = document.createElement('script');
  script.async = true;
  script.src = `${url}/matomo.js`;
  document.head.appendChild(script);
}

/** Track a page view. */
export function trackPageView(pathname: string): void {
  if (!enabled) return;
  const q = paq();
  q.push(['setCustomUrl', pathname]);
  q.push(['trackPageView']);
}

/** Track a custom event. */
export function track(category: string, action: string, name?: string, value?: number): void {
  if (!enabled) return;
  paq().push(['trackEvent', category, action, name, value]);
}
