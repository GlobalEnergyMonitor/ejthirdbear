/**
 * @module slug
 * @description ID and name sanitization utilities.
 *
 * Consistent slugification and validation across the app.
 *
 * @example
 * import { slugifyId, isValidSlug, sanitizeName } from '$lib/slug';
 *
 * const slug = slugifyId('My Plant Name'); // 'my-plant-name'
 * const valid = isValidSlug('G123-abc');   // true
 * const clean = sanitizeName(untrustedInput);
 */

import slugify from 'slugify';
import { MAX_SLUG_LENGTH, MAX_NAME_LENGTH } from './constants';

export function slugifyId(input: string | undefined | null): string {
  if (!input) return '';

  return slugify(input, {
    lower: true,
    strict: true,
    replacement: '-',
  });
}

/**
 * Validate if a string looks like a valid ID/slug (alphanumeric, hyphens, underscores)
 */
export function isValidSlug(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length > MAX_SLUG_LENGTH) return false;
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
  return name.slice(0, MAX_NAME_LENGTH).replace(/[\x00-\x1f\x7f]/g, '');
}
