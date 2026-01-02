import { assetPath } from '$lib/links';
import { getPresets, upsertPreset } from '$lib/filter-state';

const DEFAULT_ICON = 'preset';
const DEFAULT_SCOPE = 'all';
const DEFAULT_VERSION = 1;

/**
 * Normalize preset data for UI display.
 * @param {Record<string, unknown>} preset
 * @param {'featured' | 'local'} source
 */
export function normalizePreset(preset, source = 'featured') {
  const safePreset = preset && typeof preset === 'object' ? preset : {};
  const title =
    (typeof safePreset.title === 'string' && safePreset.title.trim()) ||
    (typeof safePreset.name === 'string' && safePreset.name.trim()) ||
    'Untitled preset';

  return {
    id:
      (typeof safePreset.id === 'string' && safePreset.id.trim()) ||
      title.toLowerCase().replace(/\s+/g, '-') ||
      `preset-${Date.now()}`,
    title,
    description: typeof safePreset.description === 'string' ? safePreset.description : '',
    icon:
      typeof safePreset.icon === 'string' && safePreset.icon.trim()
        ? safePreset.icon
        : DEFAULT_ICON,
    filters: typeof safePreset.filters === 'object' && safePreset.filters ? safePreset.filters : {},
    trackerScope: safePreset.trackerScope || DEFAULT_SCOPE,
    createdAt: safePreset.createdAt || null,
    createdBy: safePreset.createdBy || null,
    version: safePreset.version || DEFAULT_VERSION,
    source,
    sourceFile: safePreset.sourceFile || null,
  };
}

/**
 * Convert a local preset into an exportable JSON preset.
 * @param {Record<string, unknown>} preset
 */
export function buildExportPreset(preset) {
  const normalized = normalizePreset(preset, 'local');
  let createdAt = normalized.createdAt;
  if (typeof createdAt === 'number') {
    createdAt = new Date(createdAt).toISOString();
  }
  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description,
    icon: normalized.icon,
    filters: normalized.filters,
    trackerScope: normalized.trackerScope || DEFAULT_SCOPE,
    createdAt: createdAt || new Date().toISOString(),
    createdBy: normalized.createdBy || 'local',
    version: normalized.version || DEFAULT_VERSION,
  };
}

/**
 * Import a JSON preset into local storage.
 * @param {Record<string, unknown>} rawPreset
 */
export function importPreset(rawPreset) {
  const normalized = normalizePreset(rawPreset, 'local');
  const createdAt = normalized.createdAt ? Date.parse(normalized.createdAt) : Date.now();
  return upsertPreset({
    id: normalized.id,
    name: normalized.title,
    filters: normalized.filters,
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
  });
}

/**
 * Load featured presets from the static manifest.
 * @param {typeof fetch} fetchFn
 */
export async function loadFeaturedPresets(fetchFn = fetch) {
  const manifestUrl = assetPath('presets/index.json');
  let manifest;
  try {
    const res = await fetchFn(manifestUrl);
    if (!res.ok) return [];
    manifest = await res.json();
  } catch {
    return [];
  }

  const files = Array.isArray(manifest) ? manifest : manifest?.presets;
  if (!Array.isArray(files) || files.length === 0) return [];

  const presets = await Promise.all(
    files.map(async (file) => {
      if (typeof file !== 'string' || !file) return null;
      try {
        const res = await fetchFn(assetPath(`presets/${file}`));
        if (!res.ok) return null;
        const data = await res.json();
        return normalizePreset({ ...data, sourceFile: file }, 'featured');
      } catch {
        return null;
      }
    })
  );

  return presets.filter(Boolean);
}

/**
 * Load local presets from storage and normalize for UI.
 */
export function loadLocalPresets() {
  return getPresets().map((preset) => normalizePreset(preset, 'local'));
}
