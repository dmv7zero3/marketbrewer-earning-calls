/**
 * Layer 3: Cross-Reference Validation
 *
 * Validates extracted data against external sources:
 * - Kalshi event dates (±24 hours tolerance)
 * - Existing transcripts in DynamoDB (duplicate detection)
 * - Content hash comparison
 *
 * This layer requires access to external data sources.
 */

import {
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ExtractedTranscriptData,
} from './types';
import { parseDate, datesWithinTolerance } from '../utils/dateUtils';
import {
  generateContentHash,
  checkDuplicate,
  generateFingerprint,
  checkNearDuplicate,
} from '../utils/hashUtils';

/**
 * Cross-reference data sources
 */
export interface CrossReferenceData {
  // Kalshi event data
  kalshiEventDate?: Date;
  kalshiEventTicker?: string;

  // Existing transcripts
  existingContentHashes: string[];
  existingFingerprints?: Map<string, string[]>;

  // Company data
  expectedCompanyTickers?: string[];
}

export interface CrossReferenceConfig {
  dateToleranceHours?: number; // Default 24
  nearDuplicateThreshold?: number; // Default 0.8
  requireKalshiMatch?: boolean;
}

/**
 * Validate against cross-reference sources (Layer 3)
 */
export function validateCrossReference(
  extracted: ExtractedTranscriptData,
  crossRef: CrossReferenceData,
  config: CrossReferenceConfig = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const checksPerformed: string[] = [];

  const dateToleranceHours = config.dateToleranceHours ?? 24;
  const nearDupThreshold = config.nearDuplicateThreshold ?? 0.8;

  // ===== KALSHI DATE CROSS-REFERENCE =====
  checksPerformed.push('kalshi_date_match');
  if (crossRef.kalshiEventDate && extracted.callDate) {
    const extractedDateResult = parseDate(extracted.callDate);

    if (extractedDateResult.success && extractedDateResult.date) {
      const tolerance = datesWithinTolerance(
        extractedDateResult.date,
        crossRef.kalshiEventDate,
        dateToleranceHours
      );

      if (!tolerance.withinTolerance) {
        const severity = config.requireKalshiMatch ? 'major' : 'minor';
        errors.push({
          field: 'callDate',
          expected: crossRef.kalshiEventDate.toISOString(),
          actual: extractedDateResult.date.toISOString(),
          severity,
          message: `Date differs from Kalshi by ${tolerance.differenceHours.toFixed(1)} hours (max tolerance: ${dateToleranceHours}h)`,
        });
      } else if (tolerance.differenceHours > dateToleranceHours / 2) {
        warnings.push({
          field: 'callDate',
          message: `Date is ${tolerance.differenceHours.toFixed(1)} hours from Kalshi date (within ${dateToleranceHours}h tolerance)`,
          severity: 'info',
        });
      }
    }
  } else if (config.requireKalshiMatch && !crossRef.kalshiEventDate) {
    warnings.push({
      field: 'kalshiEventDate',
      message: 'No Kalshi event date available for cross-reference',
      severity: 'warning',
    });
  }

  // ===== KALSHI TICKER MATCH =====
  checksPerformed.push('kalshi_ticker_match');
  if (crossRef.kalshiEventTicker && extracted.ticker) {
    // Kalshi tickers often have format like "AAPL-24Q4-MENTION"
    const kalshiTickerBase = crossRef.kalshiEventTicker.split('-')[0];

    if (
      kalshiTickerBase &&
      kalshiTickerBase.toUpperCase() !== extracted.ticker.toUpperCase()
    ) {
      warnings.push({
        field: 'ticker',
        message: `Ticker "${extracted.ticker}" may not match Kalshi event "${crossRef.kalshiEventTicker}"`,
        severity: 'warning',
      });
    }
  }

  // ===== EXACT DUPLICATE DETECTION =====
  checksPerformed.push('exact_duplicate_check');
  if (extracted.content && crossRef.existingContentHashes.length > 0) {
    const contentHash = generateContentHash(extracted.content);
    const duplicateCheck = checkDuplicate(contentHash, crossRef.existingContentHashes);

    if (duplicateCheck.isDuplicate) {
      errors.push({
        field: 'content',
        expected: 'Unique content',
        actual: `Duplicate of existing transcript (hash: ${duplicateCheck.matchingHash?.substring(0, 12)}...)`,
        severity: 'critical',
        message: 'This transcript has already been saved (exact duplicate)',
      });
    }
  }

  // ===== NEAR-DUPLICATE DETECTION =====
  checksPerformed.push('near_duplicate_check');
  if (extracted.content && crossRef.existingFingerprints && crossRef.existingFingerprints.size > 0) {
    const fingerprint = generateFingerprint(extracted.content);
    const nearDupCheck = checkNearDuplicate(
      fingerprint,
      crossRef.existingFingerprints,
      nearDupThreshold
    );

    if (nearDupCheck.isNearDuplicate) {
      errors.push({
        field: 'content',
        expected: 'Unique content',
        actual: `${(nearDupCheck.similarity * 100).toFixed(1)}% similar to existing transcript`,
        severity: 'major',
        message: `Near-duplicate detected: ${(nearDupCheck.similarity * 100).toFixed(1)}% similar to transcript "${nearDupCheck.matchingId}"`,
      });
    } else if (nearDupCheck.similarity > 0.5) {
      warnings.push({
        field: 'content',
        message: `Content is ${(nearDupCheck.similarity * 100).toFixed(1)}% similar to an existing transcript`,
        severity: 'info',
      });
    }
  }

  // ===== COMPANY TICKER CROSS-REFERENCE =====
  checksPerformed.push('company_ticker_list');
  if (extracted.ticker && crossRef.expectedCompanyTickers && crossRef.expectedCompanyTickers.length > 0) {
    const tickerMatch = crossRef.expectedCompanyTickers.some(
      (t) => t.toUpperCase() === extracted.ticker?.toUpperCase()
    );

    if (!tickerMatch) {
      errors.push({
        field: 'ticker',
        expected: crossRef.expectedCompanyTickers.join(', '),
        actual: extracted.ticker,
        severity: 'minor',
        message: `Ticker "${extracted.ticker}" not in expected list for this company`,
      });
    }
  }

  // ===== SOURCE URL VALIDATION =====
  checksPerformed.push('source_url_domain');
  if (extracted.sourceUrl) {
    try {
      const url = new URL(extracted.sourceUrl);
      const allowedDomains = ['seekingalpha.com', 'www.seekingalpha.com'];

      if (!allowedDomains.includes(url.hostname)) {
        warnings.push({
          field: 'sourceUrl',
          message: `Source domain "${url.hostname}" is not Seeking Alpha`,
          severity: 'warning',
        });
      }

      // Check for transcript URL pattern
      if (!url.pathname.includes('transcript') && !url.pathname.includes('earnings')) {
        warnings.push({
          field: 'sourceUrl',
          message: 'URL path does not contain "transcript" or "earnings"',
          severity: 'info',
        });
      }
    } catch {
      // URL parsing error already handled in Layer 1
    }
  }

  // Determine if validation passed
  const criticalCount = errors.filter((e) => e.severity === 'critical').length;
  const majorCount = errors.filter((e) => e.severity === 'major').length;
  const passed = criticalCount === 0;

  return {
    passed,
    errors,
    warnings,
    checksPerformed,
    metadata: {
      contentHash: extracted.content ? generateContentHash(extracted.content) : null,
      kalshiDateDifferenceHours: crossRef.kalshiEventDate && extracted.callDate
        ? (() => {
            const parsed = parseDate(extracted.callDate);
            if (parsed.success && parsed.date) {
              return datesWithinTolerance(parsed.date, crossRef.kalshiEventDate).differenceHours;
            }
            return null;
          })()
        : null,
      criticalErrors: criticalCount,
      majorErrors: majorCount,
    },
  };
}

/**
 * Build cross-reference data from DynamoDB transcripts
 */
export function buildCrossReferenceFromTranscripts(
  transcripts: Array<{ content: string; contentHash?: string; SK: string }>
): Pick<CrossReferenceData, 'existingContentHashes' | 'existingFingerprints'> {
  const existingContentHashes: string[] = [];
  const existingFingerprints = new Map<string, string[]>();

  for (const transcript of transcripts) {
    // Use stored hash or generate new one
    const hash = transcript.contentHash || generateContentHash(transcript.content);
    existingContentHashes.push(hash);

    // Generate fingerprint for near-duplicate detection
    const fingerprint = generateFingerprint(transcript.content);
    existingFingerprints.set(transcript.SK, fingerprint);
  }

  return {
    existingContentHashes,
    existingFingerprints,
  };
}

/**
 * Check if we should skip cross-reference validation
 * (e.g., when scraping for a new company with no existing data)
 */
export function canSkipCrossReference(crossRef: CrossReferenceData): boolean {
  return (
    !crossRef.kalshiEventDate &&
    crossRef.existingContentHashes.length === 0 &&
    (!crossRef.existingFingerprints || crossRef.existingFingerprints.size === 0)
  );
}
