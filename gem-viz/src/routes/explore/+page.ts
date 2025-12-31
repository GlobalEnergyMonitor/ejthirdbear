// Disable SSR for this page - widgets use client-side DuckDB WASM
// and the composables use $state() which doesn't work during SSR
export const ssr = false;
