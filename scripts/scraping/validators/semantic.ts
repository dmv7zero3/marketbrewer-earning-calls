/**
 * Layer 2: Semantic Validation
 *
 * Validates that extracted data is semantically correct and plausible.
 * Compares extracted data against expected values.
 *
 * Checks:
 * - Company name fuzzy matches expected
 * - Ticker matches expected
 * - Quarter matches expected
 * - Date is within plausible reporting window
 * - Content looks like an earnings transcript
 */

import {
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ExtractedTranscriptData,
  type ExpectedTranscriptData,
} from './types';
import { fuzzyMatch, matchTicker, matchQuarter } from '../utils/fuzzyMatch';
import { parseDate, isDatePlausible } from '../utils/dateUtils';

/**
 * Keywords that should appear in an earnings call transcript
 */
const TRANSCRIPT_KEYWORDS = [
  'earnings',
  'revenue',
  'quarter',
  'guidance',
  'fiscal',
  'operating',
  'margin',
  'growth',
  'income',
  'outlook',
];

/**
 * Keywords indicating executive participation
 */
const EXECUTIVE_KEYWORDS = ['ceo', 'cfo', 'chief', 'president', 'officer', 'executive'];

/**
 * Analyst/investor keywords
 */
const ANALYST_KEYWORDS = ['analyst', 'question', 'answer', 'q&a', 'operator'];

export interface SemanticValidationConfig {
  fuzzyMatchThreshold?: number; // Default 0.7 (30% difference allowed)
  requireKeywords?: boolean;
  strictDateCheck?: boolean;
}

/**
 * Validate semantic correctness of extracted data (Layer 2)
 */
export function validateSemantics(
  extracted: ExtractedTranscriptData,
  expected: ExpectedTranscriptData,
  config: SemanticValidationConfig = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const checksPerformed: string[] = [];

  const fuzzyThreshold = config.fuzzyMatchThreshold ?? 0.7;

  // ===== COMPANY NAME FUZZY MATCH =====
  checksPerformed.push('company_name_match');
  if (extracted.companyName && expected.companyName) {
    const companyMatch = fuzzyMatch(expected.companyName, extracted.companyName, fuzzyThreshold);

    if (!companyMatch.match) {
      errors.push({
        field: 'companyName',
        expected: expected.companyName,
        actual: extracted.companyName,
        severity: 'major',
        message: `Company name mismatch: expected "${expected.companyName}", got "${extracted.companyName}" (similarity: ${(companyMatch.ratio * 100).toFixed(1)}%)`,
      });
    } else if (companyMatch.matchType === 'fuzzy') {
      warnings.push({
        field: 'companyName',
        message: `Company name fuzzy matched: "${extracted.companyName}" ≈ "${expected.companyName}" (${(companyMatch.ratio * 100).toFixed(1)}% similar)`,
        severity: 'info',
      });
    }
  }

  // ===== TICKER EXACT MATCH =====
  checksPerformed.push('ticker_match');
  if (extracted.ticker && expected.ticker) {
    if (!matchTicker(expected.ticker, extracted.ticker)) {
      errors.push({
        field: 'ticker',
        expected: expected.ticker.toUpperCase(),
        actual: extracted.ticker.toUpperCase(),
        severity: 'major',
        message: `Ticker mismatch: expected "${expected.ticker}", got "${extracted.ticker}"`,
      });
    }
  }

  // ===== QUARTER MATCH =====
  checksPerformed.push('quarter_match');
  if (extracted.quarter && expected.quarter) {
    if (!matchQuarter(expected.quarter, extracted.quarter)) {
      errors.push({
        field: 'quarter',
        expected: expected.quarter,
        actual: extracted.quarter,
        severity: 'major',
        message: `Quarter mismatch: expected "${expected.quarter}", got "${extracted.quarter}"`,
      });
    }
  }

  // ===== FISCAL YEAR MATCH =====
  checksPerformed.push('fiscal_year_match');
  if (extracted.fiscalYear && expected.fiscalYear) {
    if (extracted.fiscalYear !== expected.fiscalYear) {
      // Allow 1 year difference for FY offset companies
      if (Math.abs(extracted.fiscalYear - expected.fiscalYear) <= 1) {
        warnings.push({
          field: 'fiscalYear',
          message: `Fiscal year differs by 1: expected ${expected.fiscalYear}, got ${extracted.fiscalYear} (may be FY offset)`,
          severity: 'warning',
        });
      } else {
        errors.push({
          field: 'fiscalYear',
          expected: String(expected.fiscalYear),
          actual: String(extracted.fiscalYear),
          severity: 'major',
          message: `Fiscal year mismatch: expected ${expected.fiscalYear}, got ${extracted.fiscalYear}`,
        });
      }
    }
  }

  // ===== DATE PLAUSIBILITY =====
  checksPerformed.push('date_plausibility');
  if (extracted.callDate && extracted.quarter && extracted.fiscalYear) {
    const dateResult = parseDate(extracted.callDate);

    if (dateResult.success && dateResult.date) {
      const plausibility = isDatePlausible(
        dateResult.date,
        extracted.quarter,
        extracted.fiscalYear,
        config.strictDateCheck ?? false
      );

      if (!plausibility.plausible) {
        errors.push({
          field: 'callDate',
          expected: `Month in ${plausibility.expectedMonths.map((m) => m + 1).join(', ')}`,
          actual: `Month ${plausibility.actualMonth + 1}`,
          severity: 'major',
          message: plausibility.reason,
        });
      }
    }
  }

  // ===== CONTENT KEYWORD CHECK =====
  checksPerformed.push('content_keywords');
  if (config.requireKeywords !== false && extracted.content) {
    const contentLower = extracted.content.toLowerCase();

    // Check for transcript keywords
    const foundKeywords = TRANSCRIPT_KEYWORDS.filter((kw) => contentLower.includes(kw));
    const keywordRatio = foundKeywords.length / TRANSCRIPT_KEYWORDS.length;

    if (keywordRatio < 0.3) {
      errors.push({
        field: 'content',
        expected: 'Earnings transcript content',
        actual: `Only ${foundKeywords.length}/${TRANSCRIPT_KEYWORDS.length} expected keywords found`,
        severity: 'major',
        message: `Content may not be an earnings transcript. Missing expected keywords.`,
      });
    } else if (keywordRatio < 0.5) {
      warnings.push({
        field: 'content',
        message: `Only ${foundKeywords.length}/${TRANSCRIPT_KEYWORDS.length} expected keywords found in content`,
        severity: 'warning',
      });
    }

    // Check for executive mentions
    const hasExecutive = EXECUTIVE_KEYWORDS.some((kw) => contentLower.includes(kw));
    if (!hasExecutive) {
      warnings.push({
        field: 'content',
        message: 'No executive (CEO, CFO) mentions found in content',
        severity: 'warning',
      });
    }

    // Check for Q&A section
    const hasQA = ANALYST_KEYWORDS.some((kw) => contentLower.includes(kw));
    if (!hasQA) {
      warnings.push({
        field: 'content',
        message: 'No Q&A or analyst mentions found - may be partial transcript',
        severity: 'info',
      });
    }
  }

  // ===== TITLE CONSISTENCY =====
  checksPerformed.push('title_consistency');
  if (extracted.title) {
    const titleLower = extracted.title.toLowerCase();

    // Title should mention company
    if (expected.companyName) {
      const companyInTitle = fuzzyMatch(expected.companyName, extracted.title, 0.5);
      if (!companyInTitle.match && !titleLower.includes(expected.ticker.toLowerCase())) {
        warnings.push({
          field: 'title',
          message: `Title "${extracted.title}" doesn't appear to mention expected company "${expected.companyName}"`,
          severity: 'warning',
        });
      }
    }

    // Title should mention "earnings"
    if (!titleLower.includes('earning')) {
      warnings.push({
        field: 'title',
        message: 'Title does not contain "earnings" - may be wrong page type',
        severity: 'warning',
      });
    }
  }

  // ===== PARTICIPANTS CHECK =====
  checksPerformed.push('participants_quality');
  if (extracted.participants && extracted.participants.length > 0) {
    // Check if any executives are in participants
    const hasExecutiveParticipant = extracted.participants.some((p) => {
      const pLower = p.toLowerCase();
      return EXECUTIVE_KEYWORDS.some((kw) => pLower.includes(kw));
    });

    if (!hasExecutiveParticipant) {
      warnings.push({
        field: 'participants',
        message: 'No executives (CEO, CFO) identified in participants list',
        severity: 'warning',
      });
    }
  }

  // Determine if validation passed
  const criticalCount = errors.filter((e) => e.severity === 'critical').length;
  const majorCount = errors.filter((e) => e.severity === 'major').length;
  const passed = criticalCount === 0 && majorCount <= 1; // Allow 1 major error

  return {
    passed,
    errors,
    warnings,
    checksPerformed,
    metadata: {
      companyMatchRatio: extracted.companyName && expected.companyName
        ? fuzzyMatch(expected.companyName, extracted.companyName).ratio
        : null,
      criticalErrors: criticalCount,
      majorErrors: majorCount,
    },
  };
}

/**
 * Check if content looks like an earnings transcript
 * Quick check without full validation
 */
export function looksLikeTranscript(content: string): {
  isTranscript: boolean;
  confidence: number;
  reasons: string[];
} {
  if (!content || content.length < 500) {
    return {
      isTranscript: false,
      confidence: 0,
      reasons: ['Content too short'],
    };
  }

  const contentLower = content.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  // Check for transcript keywords
  const keywordCount = TRANSCRIPT_KEYWORDS.filter((kw) => contentLower.includes(kw)).length;
  score += keywordCount * 10;
  if (keywordCount >= 5) {
    reasons.push(`Found ${keywordCount} earnings keywords`);
  }

  // Check for executive mentions
  if (EXECUTIVE_KEYWORDS.some((kw) => contentLower.includes(kw))) {
    score += 20;
    reasons.push('Executive mentions found');
  }

  // Check for Q&A format
  if (contentLower.includes('question') || contentLower.includes('q&a')) {
    score += 15;
    reasons.push('Q&A section detected');
  }

  // Check for operator mentions (conference call format)
  if (contentLower.includes('operator')) {
    score += 10;
    reasons.push('Conference call format detected');
  }

  // Check word count
  const wordCount = content.split(/\s+/).length;
  if (wordCount >= 5000) {
    score += 20;
    reasons.push(`Word count: ${wordCount}`);
  } else if (wordCount >= 2000) {
    score += 10;
  }

  const confidence = Math.min(100, score);
  const isTranscript = confidence >= 50;

  return {
    isTranscript,
    confidence,
    reasons,
  };
}
