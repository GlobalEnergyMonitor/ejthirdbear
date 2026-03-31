// CSR only — query state lives in the URL and is managed client-side.
// No server fetch on load; data is fetched reactively as the query changes.
export const prerender = false;
export const ssr = false;
