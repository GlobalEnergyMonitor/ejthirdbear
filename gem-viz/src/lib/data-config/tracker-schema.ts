/**
 * Centralized Tracker Schema Configuration
 *
 * Single source of truth for:
 * - Available trackers and their metadata
 * - Tracker ↔ MotherDuck asset type mapping
 * - Status values and country list
 */

// =============================================================================
// TRACKERS
// =============================================================================

export const TRACKERS = [
  'Bioenergy Power',
  'Coal Plant',
  'Gas Pipeline',
  'Gas Plant',
  'Iron Mine',
  'Steel Plant',
] as const;

export type TrackerName = (typeof TRACKERS)[number];

// =============================================================================
// TRACKER TO MOTHERDUCK ASSET TYPE MAPPING
// =============================================================================

/**
 * Maps UI tracker names to MotherDuck "Asset Type" column values.
 * Use this when querying the ownership table.
 */
export const TRACKER_TO_ASSET_TYPE: Record<TrackerName, string> = {
  'Bioenergy Power': 'Bioenergy Power',
  'Coal Plant': 'Coal Plant',
  'Gas Pipeline': 'Natural Gas Transmission Pipeline',
  'Gas Plant': 'Gas Plant',
  'Iron Mine': 'Iron Ore Mine',
  'Steel Plant': 'Iron & Steel Plant',
};

/**
 * Get the MotherDuck asset type for a tracker
 */
export function getAssetTypeForTracker(tracker: string): string | null {
  if (!isValidTracker(tracker)) return null;
  return TRACKER_TO_ASSET_TYPE[tracker] || tracker;
}

/**
 * Check if a string is a valid tracker name
 */
export function isValidTracker(tracker: string): tracker is TrackerName {
  return TRACKERS.includes(tracker as TrackerName);
}

// =============================================================================
// STATUS VALUES
// =============================================================================

export const STATUS_VALUES = [
  'announced',
  'cancelled',
  'construction',
  'idle',
  'mothballed',
  'operating',
  'permitted',
  'pre-construction',
  'pre-permit',
  'proposed',
  'retired',
  'shelved',
] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];

// =============================================================================
// COUNTRIES (for geography filter)
// =============================================================================

export const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Angola',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cayman Islands',
  'Chile',
  'China',
  'Colombia',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Estonia',
  'Ethiopia',
  'Finland',
  'France',
  'Gabon',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Guatemala',
  'Guinea',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Liberia',
  'Libya',
  'Lithuania',
  'Luxembourg',
  'Macau',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Mali',
  'Malta',
  'Mauritius',
  'Mexico',
  'Moldova',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Puerto Rico',
  'Qatar',
  'Romania',
  'Russia',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'South Africa',
  'South Korea',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkmenistan',
  'T\u00FCrkiye',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
] as const;

export type Country = (typeof COUNTRIES)[number];
