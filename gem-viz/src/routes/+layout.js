// Trailing slash generates /path/index.html — works on both Fly.io and static hosts (DO Spaces)
export const trailingSlash = 'always';

// Dynamic SSR by default; individual routes can opt into prerender = true
export const prerender = false;
