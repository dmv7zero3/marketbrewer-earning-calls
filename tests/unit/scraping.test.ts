/**
 * Unit Tests for Scraping Utilities and Validators
 *
 * Tests fuzzy matching, date utilities, hash utilities, and validation logic.
 */

import { describe, it, expect } from 'bun:test';
import {
  // Fuzzy matching
  levenshteinDistance,
  levenshteinRatio,
  normalizeString,
  removeCompanySuffixes,
  fuzzyMatch,
  matchTicker,
  parseQuarter,
  matchQuarter,
} from '../../scripts/scraping/utils/fuzzyMatch';

import {
  // Date utilities
  parseDate,
  isDatePlausible,
  datesWithinTolerance,
  getFiscalQuarterFromDate,
} from '../../scripts/scraping/utils/dateUtils';

import {
  // Hash utilities
  sha256,
  generateContentHash,
  hashesMatch,
  checkDuplicate,
} from '../../scripts/scraping/utils/hashUtils';

import {
  // Validators
  validateExtraction,
  calculateWordCount,
} from '../../scripts/scraping/validators/extraction';

import {
  validateSemantics,
  looksLikeTranscript,
} from '../../scripts/scraping/validators/semantic';

import {
  calculateConfidence,
  determineAutoDecision,
  type ExtractedTranscriptData,
  type ExpectedTranscriptData,
} from '../../scripts/scraping/validators/types';

// ============================================
// Fuzzy Matching Tests
// ============================================

describe('Levenshtein Distance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return correct distance for single edit', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
    expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
    expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('should return correct distance for longer strings', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('apple', 'aple')).toBe(1);
  });
});

describe('Levenshtein Ratio', () => {
  it('should return 1.0 for identical strings', () => {
    expect(levenshteinRatio('hello', 'hello')).toBe(1.0);
  });

  it('should return 0.0 for completely different strings', () => {
    expect(levenshteinRatio('abc', 'xyz')).toBe(0);
  });

  it('should return partial ratio for similar strings', () => {
    const ratio = levenshteinRatio('apple', 'aple');
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.0);
  });
});

describe('Company Name Normalization', () => {
  it('should normalize case and remove punctuation', () => {
    expect(normalizeString('Apple Inc.')).toBe('apple inc');
    expect(normalizeString('NVIDIA Corporation')).toBe('nvidia corporation');
    expect(normalizeString('AT&T Inc.')).toBe('att inc');
  });

  it('should collapse whitespace', () => {
    expect(normalizeString('Apple   Inc.')).toBe('apple inc');
    expect(normalizeString('  Apple  ')).toBe('apple');
  });
});

describe('Remove Company Suffixes', () => {
  it('should remove common suffixes', () => {
    expect(removeCompanySuffixes('Apple Inc.')).toBe('apple');
    expect(removeCompanySuffixes('NVIDIA Corporation')).toBe('nvidia');
    expect(removeCompanySuffixes('Tesla Technologies Inc')).toBe('tesla');
  });

  it('should handle companies without suffixes', () => {
    expect(removeCompanySuffixes('Apple')).toBe('apple');
    expect(removeCompanySuffixes('Tesla')).toBe('tesla');
  });
});

describe('Fuzzy Match', () => {
  it('should exact match identical names', () => {
    const result = fuzzyMatch('Apple', 'Apple');
    expect(result.match).toBe(true);
    expect(result.matchType).toBe('exact');
    expect(result.ratio).toBe(1.0);
  });

  it('should match with company suffixes', () => {
    const result = fuzzyMatch('Apple', 'Apple Inc.');
    expect(result.match).toBe(true);
    expect(result.matchType).toBe('exact');
  });

  it('should match when one contains the other', () => {
    const result = fuzzyMatch('Microsoft', 'Microsoft Corporation');
    expect(result.match).toBe(true);
  });

  it('should fuzzy match similar names', () => {
    const result = fuzzyMatch('Netflix', 'Netflx'); // typo
    expect(result.match).toBe(true);
    expect(result.matchType).toBe('fuzzy');
  });

  it('should not match different companies', () => {
    const result = fuzzyMatch('Apple', 'Microsoft');
    expect(result.match).toBe(false);
    expect(result.matchType).toBe('no_match');
  });

  it('should respect threshold', () => {
    const result = fuzzyMatch('Apple', 'Appel', 0.9);
    expect(result.match).toBe(false);
  });
});

describe('Ticker Matching', () => {
  it('should match identical tickers', () => {
    expect(matchTicker('AAPL', 'AAPL')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(matchTicker('AAPL', 'aapl')).toBe(true);
    expect(matchTicker('aapl', 'AAPL')).toBe(true);
  });

  it('should not match different tickers', () => {
    expect(matchTicker('AAPL', 'MSFT')).toBe(false);
  });

  it('should handle empty strings', () => {
    expect(matchTicker('', 'AAPL')).toBe(false);
    expect(matchTicker('AAPL', '')).toBe(false);
  });
});

describe('Quarter Parsing', () => {
  it('should parse simple quarters', () => {
    expect(parseQuarter('Q1').quarter).toBe('Q1');
    expect(parseQuarter('Q4').quarter).toBe('Q4');
  });

  it('should parse quarters with years', () => {
    const result = parseQuarter('Q4 2025');
    expect(result.quarter).toBe('Q4');
    expect(result.year).toBe(2025);
  });

  it('should parse FY quarters', () => {
    const result = parseQuarter('Q1 FY2026');
    expect(result.quarter).toBe('Q1');
    expect(result.year).toBe(2026);
  });

  it('should handle invalid input', () => {
    expect(parseQuarter('Q5').match).toBe(false);
    expect(parseQuarter('').match).toBe(false);
  });
});

// ============================================
// Date Utilities Tests
// ============================================

describe('Date Parsing', () => {
  it('should parse ISO dates', () => {
    const result = parseDate('2026-01-21');
    expect(result.success).toBe(true);
    expect(result.date?.getFullYear()).toBe(2026);
    expect(result.date?.getMonth()).toBe(0); // January
    expect(result.date?.getDate()).toBe(21);
  });

  it('should parse US format dates', () => {
    const result = parseDate('January 21, 2026');
    expect(result.success).toBe(true);
    expect(result.date?.getFullYear()).toBe(2026);
  });

  it('should parse abbreviated month dates', () => {
    const result = parseDate('Jan 21, 2026');
    expect(result.success).toBe(true);
    expect(result.date?.getMonth()).toBe(0);
  });

  it('should handle invalid dates', () => {
    const result = parseDate('not a date');
    expect(result.success).toBe(false);
  });
});

describe('Date Plausibility', () => {
  it('should accept Q1 earnings in April-May', () => {
    const date = new Date(2026, 3, 15); // April 15, 2026
    const result = isDatePlausible(date, 'Q1', 2026);
    expect(result.plausible).toBe(true);
  });

  it('should accept Q4 earnings in January (next year)', () => {
    const date = new Date(2026, 0, 21); // January 21, 2026
    const result = isDatePlausible(date, 'Q4', 2025);
    expect(result.plausible).toBe(true);
  });

  it('should reject Q1 earnings in December', () => {
    const date = new Date(2026, 11, 15); // December 15, 2026
    const result = isDatePlausible(date, 'Q1', 2026, true);
    expect(result.plausible).toBe(false);
  });
});

describe('Date Tolerance', () => {
  it('should return true for same date', () => {
    const date1 = new Date('2026-01-21T10:00:00Z');
    const date2 = new Date('2026-01-21T10:00:00Z');
    const result = datesWithinTolerance(date1, date2, 24);
    expect(result.withinTolerance).toBe(true);
    expect(result.differenceHours).toBe(0);
  });

  it('should return true within tolerance', () => {
    const date1 = new Date('2026-01-21T10:00:00Z');
    const date2 = new Date('2026-01-22T05:00:00Z'); // 19 hours later
    const result = datesWithinTolerance(date1, date2, 24);
    expect(result.withinTolerance).toBe(true);
  });

  it('should return false outside tolerance', () => {
    const date1 = new Date('2026-01-21T10:00:00Z');
    const date2 = new Date('2026-01-23T10:00:00Z'); // 48 hours later
    const result = datesWithinTolerance(date1, date2, 24);
    expect(result.withinTolerance).toBe(false);
    expect(result.differenceHours).toBe(48);
  });
});

// ============================================
// Hash Utilities Tests
// ============================================

describe('SHA-256 Hashing', () => {
  it('should generate consistent hashes', () => {
    const hash1 = sha256('hello');
    const hash2 = sha256('hello');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different content', () => {
    const hash1 = sha256('hello');
    const hash2 = sha256('world');
    expect(hash1).not.toBe(hash2);
  });

  it('should return 64 character hex string', () => {
    const hash = sha256('test');
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe('Content Hash', () => {
  it('should normalize whitespace before hashing', () => {
    const hash1 = generateContentHash('hello  world');
    const hash2 = generateContentHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('should normalize line endings', () => {
    const hash1 = generateContentHash('hello\r\nworld');
    const hash2 = generateContentHash('hello\nworld');
    expect(hash1).toBe(hash2);
  });
});

describe('Duplicate Detection', () => {
  it('should detect exact duplicates', () => {
    const hash = generateContentHash('test content');
    const result = checkDuplicate(hash, [hash]);
    expect(result.isDuplicate).toBe(true);
  });

  it('should not flag non-duplicates', () => {
    const hash1 = generateContentHash('content 1');
    const hash2 = generateContentHash('content 2');
    const result = checkDuplicate(hash1, [hash2]);
    expect(result.isDuplicate).toBe(false);
  });
});

// ============================================
// Validation Tests
// ============================================

describe('Extraction Validation', () => {
  const baseData: ExtractedTranscriptData = {
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    quarter: 'Q4',
    fiscalYear: 2025,
    callDate: '2026-01-30',
    callTime: null,
    content: 'This is a sample transcript with enough words. '.repeat(50),
    participants: ['Tim Cook - CEO', 'Luca Maestri - CFO'],
    title: 'Apple Inc. (AAPL) Q4 2025 Earnings Call Transcript',
    wordCount: 500,
    sourceUrl: 'https://seekingalpha.com/article/123',
    sourceTitle: 'Apple Q4 2025 Earnings',
    rawHtml: '<html>...</html>',
    extractedAt: new Date().toISOString(),
  };

  it('should pass with valid data', () => {
    const data = { ...baseData, wordCount: 5000, content: 'word '.repeat(5000) };
    const result = validateExtraction(data);
    expect(result.passed).toBe(true);
  });

  it('should fail with empty content', () => {
    const data = { ...baseData, content: '', wordCount: 0 };
    const result = validateExtraction(data);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.field === 'content')).toBe(true);
  });

  it('should fail with low word count', () => {
    const data = { ...baseData, content: 'short', wordCount: 1 };
    const result = validateExtraction(data);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.field === 'wordCount')).toBe(true);
  });

  it('should fail with invalid quarter', () => {
    const data = { ...baseData, quarter: 'Q5' };
    const result = validateExtraction(data);
    expect(result.passed).toBe(false);
  });

  it('should fail with unreasonable year', () => {
    const data = { ...baseData, fiscalYear: 1990 };
    const result = validateExtraction(data);
    expect(result.passed).toBe(false);
  });
});

describe('Semantic Validation', () => {
  const extracted: ExtractedTranscriptData = {
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    quarter: 'Q4',
    fiscalYear: 2025,
    callDate: '2026-01-30',
    callTime: null,
    content: 'CEO discussed earnings revenue growth guidance for the quarter fiscal year operating margin outlook.',
    participants: ['Tim Cook - CEO'],
    title: 'Apple Inc. (AAPL) Q4 2025 Earnings Call Transcript',
    wordCount: 5000,
    sourceUrl: 'https://seekingalpha.com/article/123',
    sourceTitle: 'Apple Q4 2025 Earnings',
    rawHtml: '<html>...</html>',
    extractedAt: new Date().toISOString(),
  };

  const expected: ExpectedTranscriptData = {
    companyName: 'Apple',
    ticker: 'AAPL',
    quarter: 'Q4',
    fiscalYear: 2025,
  };

  it('should pass with matching data', () => {
    const result = validateSemantics(extracted, expected);
    expect(result.passed).toBe(true);
  });

  it('should add error with ticker mismatch', () => {
    const wrongExpected = { ...expected, ticker: 'MSFT' };
    const result = validateSemantics(extracted, wrongExpected);
    // Ticker mismatch is a major error
    expect(result.errors.some((e) => e.field === 'ticker')).toBe(true);
    expect(result.errors.some((e) => e.severity === 'major' && e.field === 'ticker')).toBe(true);
  });

  it('should add error with quarter mismatch', () => {
    const wrongExpected = { ...expected, quarter: 'Q1' };
    const result = validateSemantics(extracted, wrongExpected);
    // Quarter mismatch is a major error
    expect(result.errors.some((e) => e.field === 'quarter')).toBe(true);
  });
});

describe('Transcript Detection', () => {
  it('should detect transcript content', () => {
    // Content must be at least 500 chars for looksLikeTranscript
    const content = `
      Welcome to the Q4 2025 earnings call for Apple Inc. Today we'll discuss our quarterly results
      and provide guidance on our fiscal year outlook. Our CEO Tim Cook will present the revenue
      and operating margin performance. The CFO will discuss our income growth and operating expenses.
      After the prepared remarks, the operator will open the line for analyst questions.

      We are pleased to report strong earnings growth this quarter. Revenue increased significantly
      compared to the same quarter last year. Our operating margin improved due to cost optimization.
      The CEO emphasized our commitment to innovation and shareholder returns.

      During the Q&A session, analysts asked about our guidance for the next fiscal quarter.
      Management provided outlook on expected revenue growth and margin expansion.
    `;
    const result = looksLikeTranscript(content);
    expect(result.isTranscript).toBe(true);
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('should reject non-transcript content', () => {
    // Short content should fail
    const content = 'This is just a random blog post about cooking recipes.';
    const result = looksLikeTranscript(content);
    expect(result.isTranscript).toBe(false);
  });

  it('should reject content that is too short', () => {
    const content = 'Short earnings call content with CEO and revenue.';
    const result = looksLikeTranscript(content);
    expect(result.isTranscript).toBe(false);
    expect(result.reasons).toContain('Content too short');
  });
});

// ============================================
// Confidence Scoring Tests
// ============================================

describe('Confidence Scoring', () => {
  it('should return 100 for no errors', () => {
    const results = [
      { passed: true, errors: [], warnings: [], checksPerformed: [] },
    ];
    const { score } = calculateConfidence(results);
    expect(score).toBe(100);
  });

  it('should deduct 50 for critical errors', () => {
    const results = [
      {
        passed: false,
        errors: [{ field: 'test', expected: '', actual: '', severity: 'critical' as const, message: '' }],
        warnings: [],
        checksPerformed: [],
      },
    ];
    const { score, hasCriticalFailure } = calculateConfidence(results);
    expect(score).toBe(50);
    expect(hasCriticalFailure).toBe(true);
  });

  it('should deduct 15 for major errors', () => {
    const results = [
      {
        passed: false,
        errors: [{ field: 'test', expected: '', actual: '', severity: 'major' as const, message: '' }],
        warnings: [],
        checksPerformed: [],
      },
    ];
    const { score } = calculateConfidence(results);
    expect(score).toBe(85);
  });
});

describe('Auto Decision', () => {
  it('should approve for score >= 90', () => {
    expect(determineAutoDecision(95, false)).toBe('approve');
    expect(determineAutoDecision(90, false)).toBe('approve');
  });

  it('should require review for score 70-89', () => {
    expect(determineAutoDecision(85, false)).toBe('review');
    expect(determineAutoDecision(70, false)).toBe('review');
  });

  it('should reject for score < 70', () => {
    expect(determineAutoDecision(65, false)).toBe('reject');
    expect(determineAutoDecision(0, false)).toBe('reject');
  });

  it('should reject for critical failure regardless of score', () => {
    expect(determineAutoDecision(95, true)).toBe('reject');
  });
});

describe('Word Count Calculation', () => {
  it('should count words correctly', () => {
    expect(calculateWordCount('hello world')).toBe(2);
    expect(calculateWordCount('one two three four five')).toBe(5);
  });

  it('should handle extra whitespace', () => {
    expect(calculateWordCount('hello   world')).toBe(2);
    expect(calculateWordCount('  hello  world  ')).toBe(2);
  });

  it('should handle empty strings', () => {
    expect(calculateWordCount('')).toBe(0);
    expect(calculateWordCount('   ')).toBe(0);
  });
});
