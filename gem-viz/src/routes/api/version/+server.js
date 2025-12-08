import { json } from '@sveltejs/kit';

export async function GET() {
  try {
    // Try to load injected version info from build
    const versionModule = await import('$lib/generated/version.json', { assert: { type: 'json' } });
    const versionInfo = versionModule.default;

    return json(versionInfo, {
      headers: {
        'Cache-Control': 'no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    // Fallback if version file not found
    return json({
      version: 'unknown',
      commit: 'unknown',
      message: 'version info unavailable',
      timestamp: new Date().toISOString(),
      error: 'version.json not found - build may not have completed'
    }, {
      status: 503,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
