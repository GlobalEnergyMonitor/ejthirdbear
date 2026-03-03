/**
 * Global API call log — records every REST API call made by the app.
 * Used by the ApiCallLog debug panel at the bottom of every page.
 */

export interface ApiCall {
	url: string;
	method: string;
	status: number | null;
	durationMs: number;
	timestamp: Date;
	error?: string;
	/** Why this call was made — which component/operation triggered it */
	reason?: string;
}

const MAX_LOG_SIZE = 200;
const log: ApiCall[] = [];
let _revision = $state(0);

/** Record an API call. Called from fetch wrappers across the app. */
export function logApiCall(call: ApiCall) {
	log.push(call);
	if (log.length > MAX_LOG_SIZE) log.splice(0, log.length - MAX_LOG_SIZE);
	_revision++;
}

/**
 * Get the current API call log (reactive — tracks revision counter).
 * Returns newest-first.
 */
export function getApiLog(): ApiCall[] {
	// Reading _revision makes this reactive in Svelte 5 $derived contexts
	void _revision;
	return log.slice().reverse();
}

/** Clear the log (e.g. on navigation) */
export function clearApiLog() {
	log.length = 0;
	_revision++;
}

/** Get count (reactive) */
export function getApiLogCount(): number {
	void _revision;
	return log.length;
}
