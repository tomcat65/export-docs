/**
 * Utility functions for Certificate of Origin (COO) generation.
 * Extracted from the COO route for testability and reuse.
 */

/**
 * Extract a clean product name from a description by removing packaging terms.
 */
export function extractProductName(description: string): string {
  if (!description) return '';

  const packagingTerms = [
    'flexitank', 'flexi tank', 'flexi-tank',
    'iso tank', 'isotank', 'iso-tank',
    'drum', 'drums', 'barrel', 'barrels',
    'pail', 'pails',
    'container', 'bulk', 'ibc', 'tote', 'totes'
  ];

  const packagingPattern = new RegExp(`\\b(${packagingTerms.join('|')})\\b`, 'gi');

  let cleanedDesc = description
    .replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|PAIL|PAILS|BARREL|BARRELS|CONTAINER|BULK|TOTE|TOTES)s?\s+/i, '')
    .replace(packagingPattern, '')
    .replace(/^\d+\s+/, '')
    .replace(/^X\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedDesc && description) {
    return description;
  }

  return cleanedDesc;
}

/**
 * Get the next business day after a given date (skips weekends).
 * Saturday -> Monday, Sunday -> Monday, weekday -> next weekday.
 */
export function getNextBusinessDay(date: Date): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + 1);

  // 0 = Sunday, 6 = Saturday
  if (result.getDay() === 0) {
    result.setDate(result.getDate() + 1); // Sunday -> Monday
  } else if (result.getDay() === 6) {
    result.setDate(result.getDate() + 2); // Saturday -> Monday
  }

  return result;
}

/**
 * Get ordinal suffix for a day number (1st, 2nd, 3rd, 4th, etc.).
 */
export function getOrdinalSuffix(n: number): string {
  if (n > 3 && n < 21) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Format a date in the formal COO style: "Month, DayOrdinal Year"
 * e.g., "December, 26th 2025"
 */
export function formatDateFormal(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();
  return `${month}, ${day}${getOrdinalSuffix(day)} ${year}`;
}
