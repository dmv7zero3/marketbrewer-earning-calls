/**
 * Layer 1: Extraction Validation
 *
 * Validates that all required fields were successfully extracted
 * from the HTML. Checks data types, presence, and basic formatting.
 *
 * Critical checks that must pass:
 * - Content not empty
 * - Word count above minimum
 * - Company name present
 * - Quarter format valid
 * - Year is reasonable
 */

import {
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ExtractedTranscriptData,
} from './types';
import { parseQuarter } from '../utils/fuzzyMatch';
import { parseDate } from '../utils/dateUtils';

/**
 * Minimum word count for a valid transcript
 * Most earnings call transcripts are 5,000-15,000 words
 */
const MINIMUM_WORD_COUNT = 1000;

/**
 * Reasonable year range for transcripts
 */
const MIN_YEAR = 2015;
const MAX_YEAR = new Date().getFullYear() + 1;

export interface ExtractionValidationConfig {
  minWordCount?: number;
  minYear?: number;
  maxYear?: number;
  requireParticipants?: boolean;
}

/**
 * Validate extracted transcript data (Layer 1)
 *
 * Performs critical checks on extracted data:
 * 1. Required fields present
 * 2. Data types valid
 * 3. Word count sufficient
 * 4. Year reasonable
 */
export function validateExtraction(
  data: ExtractedTranscriptData,
  config: ExtractionValidationConfig = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const checksPerformed: string[] = [];

  const minWordCount = config.minWordCount ?? MINIMUM_WORD_COUNT;
  const minYear = config.minYear ?? MIN_YEAR;
  const maxYear = config.maxYear ?? MAX_YEAR;

  // ===== CRITICAL CHECKS =====

  // Check: Content not empty
  checksPerformed.push('content_not_empty');
  if (!data.content || data.content.trim().length === 0) {
    errors.push({
      field: 'content',
      expected: 'Non-empty transcript content',
      actual: 'Empty or null',
      severity: 'critical',
      message: 'Transcript content is empty or missing',
    });
  }

  // Check: Word count above minimum
  checksPerformed.push('word_count_minimum');
  if (data.wordCount < minWordCount) {
    errors.push({
      field: 'wordCount',
      expected: `>= ${minWordCount} words`,
      actual: `${data.wordCount} words`,
      severity: 'critical',
      message: `Word count (${data.wordCount}) is below minimum (${minWordCount}). This may be a preview, not the full transcript.`,
    });
  }

  // Check: Company name present
  checksPerformed.push('company_name_present');
  if (!data.companyName || data.companyName.trim().length === 0) {
    errors.push({
      field: 'companyName',
      expected: 'Company name string',
      actual: 'Empty or null',
      severity: 'critical',
      message: 'Company name could not be extracted from the page',
    });
  }

  // Check: Quarter format valid
  checksPerformed.push('quarter_format_valid');
  if (!data.quarter) {
    errors.push({
      field: 'quarter',
      expected: 'Q1, Q2, Q3, or Q4',
      actual: 'null',
      severity: 'critical',
      message: 'Quarter could not be extracted from the page',
    });
  } else {
    const quarterParsed = parseQuarter(data.quarter);
    if (!quarterParsed.match) {
      errors.push({
        field: 'quarter',
        expected: 'Q1, Q2, Q3, or Q4',
        actual: data.quarter,
        severity: 'critical',
        message: `Invalid quarter format: "${data.quarter}"`,
      });
    }
  }

  // Check: Year is reasonable
  checksPerformed.push('year_reasonable');
  if (!data.fiscalYear) {
    errors.push({
      field: 'fiscalYear',
      expected: `Year between ${minYear} and ${maxYear}`,
      actual: 'null',
      severity: 'critical',
      message: 'Fiscal year could not be extracted from the page',
    });
  } else if (data.fiscalYear < minYear || data.fiscalYear > maxYear) {
    errors.push({
      field: 'fiscalYear',
      expected: `Year between ${minYear} and ${maxYear}`,
      actual: String(data.fiscalYear),
      severity: 'critical',
      message: `Fiscal year ${data.fiscalYear} is outside reasonable range`,
    });
  }

  // ===== MAJOR CHECKS =====

  // Check: Ticker present
  checksPerformed.push('ticker_present');
  if (!data.ticker || data.ticker.trim().length === 0) {
    errors.push({
      field: 'ticker',
      expected: 'Stock ticker symbol',
      actual: 'Empty or null',
      severity: 'major',
      message: 'Ticker symbol could not be extracted',
    });
  } else if (!/^[A-Z]{1,5}(\.[A-Z])?$/i.test(data.ticker.trim())) {
    // Allow 1-5 letter tickers, optionally with .A or .B suffix
    errors.push({
      field: 'ticker',
      expected: 'Valid ticker format (1-5 letters)',
      actual: data.ticker,
      severity: 'major',
      message: `Ticker "${data.ticker}" has unusual format`,
    });
  }

  // Check: Call date parseable
  checksPerformed.push('call_date_parseable');
  if (!data.callDate) {
    errors.push({
      field: 'callDate',
      expected: 'Parseable date string',
      actual: 'null',
      severity: 'major',
      message: 'Call date could not be extracted',
    });
  } else {
    const dateResult = parseDate(data.callDate);
    if (!dateResult.success) {
      errors.push({
        field: 'callDate',
        expected: 'Parseable date format',
        actual: data.callDate,
        severity: 'major',
        message: `Could not parse date: "${data.callDate}"`,
      });
    }
  }

  // ===== MINOR CHECKS =====

  // Check: Participants present
  checksPerformed.push('participants_present');
  if (config.requireParticipants !== false) {
    if (!data.participants || data.participants.length === 0) {
      warnings.push({
        field: 'participants',
        message: 'No participants (CEO, CFO, analysts) were extracted',
        severity: 'warning',
      });
    } else if (data.participants.length < 2) {
      warnings.push({
        field: 'participants',
        message: `Only ${data.participants.length} participant found; expected multiple`,
        severity: 'info',
      });
    }
  }

  // Check: Title present
  checksPerformed.push('title_present');
  if (!data.title || data.title.trim().length === 0) {
    warnings.push({
      field: 'title',
      message: 'Page title could not be extracted',
      severity: 'info',
    });
  }

  // Check: Source URL valid
  checksPerformed.push('source_url_valid');
  if (!data.sourceUrl) {
    errors.push({
      field: 'sourceUrl',
      expected: 'Valid URL',
      actual: 'null',
      severity: 'minor',
      message: 'Source URL is missing',
    });
  } else {
    try {
      new URL(data.sourceUrl);
    } catch {
      errors.push({
        field: 'sourceUrl',
        expected: 'Valid URL',
        actual: data.sourceUrl,
        severity: 'minor',
        message: 'Source URL is not a valid URL',
      });
    }
  }

  // Check: Extraction timestamp present
  checksPerformed.push('extraction_timestamp');
  if (!data.extractedAt) {
    warnings.push({
      field: 'extractedAt',
      message: 'Extraction timestamp is missing',
      severity: 'info',
    });
  }

  // Check: Raw HTML stored
  checksPerformed.push('raw_html_stored');
  if (!data.rawHtml || data.rawHtml.length === 0) {
    warnings.push({
      field: 'rawHtml',
      message: 'Raw HTML was not stored (needed for audit trail)',
      severity: 'warning',
    });
  }

  // Determine if validation passed (no critical or major errors)
  const criticalCount = errors.filter((e) => e.severity === 'critical').length;
  const majorCount = errors.filter((e) => e.severity === 'major').length;
  const passed = criticalCount === 0;

  return {
    passed,
    errors,
    warnings,
    checksPerformed,
    metadata: {
      wordCount: data.wordCount,
      criticalErrors: criticalCount,
      majorErrors: majorCount,
      minorErrors: errors.filter((e) => e.severity === 'minor').length,
      warningCount: warnings.length,
    },
  };
}

/**
 * Quick check if data has minimum required fields
 * Used before full validation to fail fast
 */
export function hasRequiredFields(data: Partial<ExtractedTranscriptData>): boolean {
  return !!(
    data.content &&
    data.content.trim().length > 0 &&
    data.companyName &&
    data.quarter &&
    data.fiscalYear
  );
}

/**
 * Calculate word count from content
 */
export function calculateWordCount(content: string): number {
  if (!content) return 0;
  return content
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}
