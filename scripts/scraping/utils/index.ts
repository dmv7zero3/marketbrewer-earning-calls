/**
 * Scraping Utilities Index
 *
 * Re-exports all utility functions for convenient importing.
 */

// Fuzzy matching utilities
export {
  levenshteinDistance,
  levenshteinRatio,
  normalizeString,
  removeCompanySuffixes,
  fuzzyMatch,
  matchTicker,
  parseQuarter,
  matchQuarter,
  type FuzzyMatchResult,
  type QuarterMatch,
} from './fuzzyMatch';

// Date utilities
export {
  QUARTER_REPORTING_MONTHS,
  QUARTER_REPORTING_MONTHS_EXTENDED,
  parseDate,
  isDatePlausible,
  datesWithinTolerance,
  formatDateForAudit,
  getExpectedReportingWindow,
  getFiscalQuarterFromDate,
  type DateParseResult,
  type PlausibilityResult,
} from './dateUtils';

// Hash utilities
export {
  sha256,
  normalizeContentForHashing,
  generateContentHash,
  generateRawHtmlHash,
  generateTranscriptId,
  hashesMatch,
  checkDuplicate,
  generateFingerprint,
  fingerprintSimilarity,
  checkNearDuplicate,
  generateAuditHash,
  type AuditHashInput,
} from './hashUtils';
