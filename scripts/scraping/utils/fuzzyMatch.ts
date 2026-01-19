/**
 * Fuzzy String Matching Utilities
 *
 * Provides Levenshtein distance calculation and fuzzy matching
 * for company name comparison with configurable thresholds.
 */

/**
 * Calculate Levenshtein distance between two strings
 * Uses dynamic programming for O(mn) time complexity
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Levenshtein ratio (similarity score 0-1)
 * 1.0 = identical, 0.0 = completely different
 */
export function levenshteinRatio(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) return 1.0; // Both empty strings are identical

  return 1 - distance / maxLength;
}

/**
 * Normalize string for comparison
 * - Lowercase
 * - Remove punctuation and special characters
 * - Collapse whitespace
 * - Trim
 */
export function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric except spaces
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

/**
 * Remove common company suffixes for better matching
 */
export function removeCompanySuffixes(name: string): string {
  const suffixes = [
    'inc',
    'incorporated',
    'corp',
    'corporation',
    'co',
    'company',
    'ltd',
    'limited',
    'llc',
    'llp',
    'plc',
    'holdings',
    'group',
    'technologies',
    'technology',
    'tech',
    'systems',
    'services',
    'solutions',
    'international',
    'intl',
    'the',
  ];

  let normalized = normalizeString(name);

  for (const suffix of suffixes) {
    // Remove suffix at the end of string
    const suffixPattern = new RegExp(`\\s+${suffix}$`, 'i');
    normalized = normalized.replace(suffixPattern, '');
  }

  return normalized.trim();
}

export interface FuzzyMatchResult {
  match: boolean;
  ratio: number;
  normalizedExpected: string;
  normalizedActual: string;
  matchType: 'exact' | 'contains' | 'fuzzy' | 'no_match';
}

/**
 * Fuzzy match two company names
 *
 * Match criteria (in order of precedence):
 * 1. Exact match after normalization
 * 2. One contains the other
 * 3. Levenshtein ratio >= threshold (default 0.7 = 30% difference allowed)
 *
 * @param expected - Expected company name
 * @param actual - Actual company name from source
 * @param threshold - Minimum ratio for fuzzy match (default 0.7)
 */
export function fuzzyMatch(
  expected: string,
  actual: string,
  threshold: number = 0.7
): FuzzyMatchResult {
  // Normalize both strings
  const normalizedExpected = removeCompanySuffixes(expected);
  const normalizedActual = removeCompanySuffixes(actual);

  // Empty string handling
  if (!normalizedExpected || !normalizedActual) {
    return {
      match: false,
      ratio: 0,
      normalizedExpected,
      normalizedActual,
      matchType: 'no_match',
    };
  }

  // 1. Exact match
  if (normalizedExpected === normalizedActual) {
    return {
      match: true,
      ratio: 1.0,
      normalizedExpected,
      normalizedActual,
      matchType: 'exact',
    };
  }

  // 2. Contains match (one is substring of the other)
  if (
    normalizedExpected.includes(normalizedActual) ||
    normalizedActual.includes(normalizedExpected)
  ) {
    // Calculate partial ratio for contains matches
    const ratio = Math.min(normalizedExpected.length, normalizedActual.length) /
      Math.max(normalizedExpected.length, normalizedActual.length);
    return {
      match: true,
      ratio,
      normalizedExpected,
      normalizedActual,
      matchType: 'contains',
    };
  }

  // 3. Levenshtein fuzzy match
  const ratio = levenshteinRatio(normalizedExpected, normalizedActual);

  return {
    match: ratio >= threshold,
    ratio,
    normalizedExpected,
    normalizedActual,
    matchType: ratio >= threshold ? 'fuzzy' : 'no_match',
  };
}

/**
 * Match ticker symbols (exact match, case-insensitive)
 */
export function matchTicker(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  return expected.toUpperCase().trim() === actual.toUpperCase().trim();
}

/**
 * Match quarter strings (e.g., "Q1", "Q2 2024", "Q4 FY2024")
 */
export interface QuarterMatch {
  match: boolean;
  quarter: string | null;
  year: number | null;
}

export function parseQuarter(quarterStr: string): QuarterMatch {
  if (!quarterStr) {
    return { match: false, quarter: null, year: null };
  }

  const normalized = quarterStr.toUpperCase().replace(/\s+/g, ' ').trim();

  // Pattern: Q1, Q2, Q3, Q4 with optional year
  const quarterPattern = /Q([1-4])\s*(?:FY)?(\d{4})?/i;
  const match = normalized.match(quarterPattern);

  if (match) {
    return {
      match: true,
      quarter: `Q${match[1]}`,
      year: match[2] ? parseInt(match[2], 10) : null,
    };
  }

  return { match: false, quarter: null, year: null };
}

export function matchQuarter(expected: string, actual: string): boolean {
  const expectedParsed = parseQuarter(expected);
  const actualParsed = parseQuarter(actual);

  if (!expectedParsed.match || !actualParsed.match) {
    return false;
  }

  // Quarter must match
  if (expectedParsed.quarter !== actualParsed.quarter) {
    return false;
  }

  // If both have years, they must match
  if (expectedParsed.year && actualParsed.year) {
    return expectedParsed.year === actualParsed.year;
  }

  // If only one has year, still consider it a match (partial info)
  return true;
}
