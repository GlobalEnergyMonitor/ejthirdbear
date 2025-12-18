/**
 * Typography utilities
 *
 * Proper typographic transformations for refined text presentation.
 * Based on traditional book typography conventions.
 */

/**
 * Convert straight quotes to curly quotes, -- to em-dash, etc.
 * @param {string} text - The text to process
 * @returns {string} - Text with smart typography applied
 */
export function smartQuotes(text) {
  if (!text) return text;

  return text
    // Opening double quotes (after space, start, or punctuation)
    .replace(/(^|[\s(\[{])"/g, '$1"')
    // Closing double quotes
    .replace(/"/g, '"')
    // Opening single quotes / apostrophes at word start
    .replace(/(^|[\s(\[{])'/g, '$1'')
    // Apostrophes and closing single quotes
    .replace(/'/g, ''')
    // Em-dash (-- or ---)
    .replace(/---?/g, '—')
    // En-dash for ranges (number-number)
    .replace(/(\d)-(\d)/g, '$1–$2')
    // Ellipsis
    .replace(/\.\.\./g, '…');
}

/**
 * Format a number with proper thousand separators
 * Uses non-breaking thin space for international style
 * @param {number} num - The number to format
 * @param {number} [decimals] - Number of decimal places
 * @returns {string} - Formatted number
 */
export function formatNumber(num, decimals) {
  if (num === null || num === undefined) return '—';
  if (typeof num !== 'number' || isNaN(num)) return String(num);

  const options = decimals !== undefined
    ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
    : {};

  // Use narrow no-break space as thousands separator (Unicode 202F)
  return num.toLocaleString('en-US', options).replace(/,/g, '\u202F');
}

/**
 * Format a percentage with proper symbol placement
 * @param {number} value - The value (0.5 = 50%, or 50 = 50%)
 * @param {boolean} [isDecimal=true] - Whether input is decimal (0.5) or percentage (50)
 * @param {number} [decimals=1] - Decimal places
 * @returns {string}
 */
export function formatPercent(value, isDecimal = true, decimals = 1) {
  if (value === null || value === undefined) return '—';
  const pct = isDecimal ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Format currency with proper symbol and spacing
 * @param {number} amount
 * @param {string} [currency='USD']
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '—';

  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥' };
  const symbol = symbols[currency] || currency + ' ';

  // Compact large numbers
  if (Math.abs(amount) >= 1e9) {
    return `${symbol}${(amount / 1e9).toFixed(1)}B`;
  }
  if (Math.abs(amount) >= 1e6) {
    return `${symbol}${(amount / 1e6).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1e3) {
    return `${symbol}${(amount / 1e3).toFixed(0)}K`;
  }

  return `${symbol}${formatNumber(amount, 0)}`;
}

/**
 * Format a date in a refined, readable style
 * @param {Date|string|number} date
 * @param {('full'|'long'|'medium'|'short')} [style='medium']
 * @returns {string}
 */
export function formatDate(date, style = 'medium') {
  if (!date) return '—';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';

  const formats = {
    full: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    short: { year: '2-digit', month: 'numeric', day: 'numeric' },
  };

  return d.toLocaleDateString('en-US', formats[style]);
}

/**
 * Truncate text with proper ellipsis
 * @param {string} text
 * @param {number} maxLength
 * @param {boolean} [wordBoundary=true] - Break at word boundary
 * @returns {string}
 */
export function truncate(text, maxLength, wordBoundary = true) {
  if (!text || text.length <= maxLength) return text;

  let truncated = text.slice(0, maxLength);

  if (wordBoundary) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      truncated = truncated.slice(0, lastSpace);
    }
  }

  return truncated.trimEnd() + '…';
}

/**
 * Convert to title case with proper handling of small words
 * @param {string} text
 * @returns {string}
 */
export function titleCase(text) {
  if (!text) return text;

  const smallWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor',
    'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'via'
  ]);

  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      // Always capitalize first and last word
      if (i === 0 || !smallWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

/**
 * Generate a readable ID from text (for anchors)
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Pluralize a word based on count
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural] - If not provided, adds 's'
 * @returns {string}
 */
export function pluralize(count, singular, plural) {
  const word = count === 1 ? singular : (plural || singular + 's');
  return `${formatNumber(count)} ${word}`;
}

/**
 * Format a range with proper en-dash
 * @param {number|string} start
 * @param {number|string} end
 * @returns {string}
 */
export function formatRange(start, end) {
  if (start === end) return String(start);
  return `${start}–${end}`;
}
