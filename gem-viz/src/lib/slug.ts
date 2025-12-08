import slugify from 'slugify';

/**
 * Consistently slugify IDs and names across the app using the slugify library
 */

export function slugifyId(input: string | undefined | null): string {
  if (!input) return '';

  return slugify(input, {
    lower: true,
    strict: true,
    replacement: '-'
  });
}

/**
 * Validate if a string looks like a valid ID/slug (alphanumeric, hyphens, underscores)
 */
export function isValidSlug(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 100) return false;
  // Allow alphanumeric, underscores, hyphens (slugified format)
  return /^[\w-]+$/.test(id);
}

/**
 * Sanitize names by removing control characters
 */
export function sanitizeName(name: string | undefined): string {
  if (!name || typeof name !== 'string') return '';
  // Limit length and remove control characters (C0 and DEL)
  // eslint-disable-next-line no-control-regex
  return name.slice(0, 500).replace(/[\x00-\x1f\x7f]/g, '');
}
