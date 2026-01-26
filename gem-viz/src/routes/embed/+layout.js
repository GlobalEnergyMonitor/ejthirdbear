// Embed routes use URL searchParams for configuration (theme, padding, etc.)
// These can't be prerendered since params aren't known at build time
export const prerender = false;

// Enable client-side rendering for embeds
export const ssr = false;
