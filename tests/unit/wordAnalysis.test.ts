// Unit Tests for Word Analysis Utilities
// Tests the core word counting and analysis logic following Kalshi MENTION rules

import { describe, it, expect } from 'bun:test';
import {
  countOccurrences,
  highlightWord,
  extractCompanyName,
  getQuarterOptions,
  getYearOptions,
  formatCents,
  calculateBet,
} from '../../src/lib/utils/wordAnalysis';

describe('countOccurrences', () => {
  describe('basic word matching', () => {
    it('should count exact word matches', () => {
      const text = 'Revenue increased significantly. Revenue growth was strong.';
      expect(countOccurrences(text, 'revenue')).toBe(2);
    });

    it('should be case insensitive', () => {
      const text = 'REVENUE increased. Revenue grew. revenue up.';
      expect(countOccurrences(text, 'revenue')).toBe(3);
      expect(countOccurrences(text, 'REVENUE')).toBe(3);
    });

    it('should not match partial words', () => {
      const text = 'prerevenue and revenued are not revenue';
      expect(countOccurrences(text, 'revenue')).toBe(1);
    });

    it('should return 0 for no matches', () => {
      const text = 'This text has no matching words.';
      expect(countOccurrences(text, 'revenue')).toBe(0);
    });

    it('should handle empty text', () => {
      expect(countOccurrences('', 'revenue')).toBe(0);
    });

    it('should handle empty word', () => {
      expect(countOccurrences('Some text here', '')).toBe(0);
      expect(countOccurrences('Some text here', '   ')).toBe(0);
    });
  });

  describe('Kalshi MENTION rules - plurals', () => {
    it('should match plurals (word + s)', () => {
      const text = 'Multiple revenues and costs were reported.';
      expect(countOccurrences(text, 'revenue')).toBe(1);
      expect(countOccurrences(text, 'cost')).toBe(1);
    });

    it('should match possessives (word + \'s)', () => {
      const text = "Netflix's growth and Amazon's revenue were impressive.";
      expect(countOccurrences(text, 'Netflix')).toBe(1);
      expect(countOccurrences(text, 'Amazon')).toBe(1);
    });

    it('should match possessive plurals (word + s\')', () => {
      const text = "The companies' revenues increased.";
      expect(countOccurrences(text, 'company')).toBe(0); // "companies" is not "company"
      expect(countOccurrences(text, 'revenue')).toBe(1);
    });
  });

  describe('Kalshi MENTION rules - should NOT match', () => {
    it('should not match grammatical inflections', () => {
      const text = 'Growing and grew are not growth.';
      expect(countOccurrences(text, 'growth')).toBe(1);
      expect(countOccurrences(text, 'grow')).toBe(0); // grow != growing/grew
    });

    it('should not match closed compounds', () => {
      const text = 'Blockchain technology is different from block chain.';
      expect(countOccurrences(text, 'blockchain')).toBe(1);
      expect(countOccurrences(text, 'block')).toBe(1); // separate word
    });
  });

  describe('special characters in words', () => {
    it('should escape special regex characters safely without throwing', () => {
      // Words with special characters are escaped to prevent regex errors
      // but may not match as expected since word boundary \b doesn't work with special chars
      const text = 'C++ and C# are programming languages.';
      // This should not throw an error
      expect(() => countOccurrences(text, 'C++')).not.toThrow();
    });

    it('should handle hyphenated words', () => {
      const text = 'Year-over-year growth was strong. YoY increased.';
      expect(countOccurrences(text, 'year-over-year')).toBe(1);
    });

    it('should handle acronyms and abbreviations', () => {
      const text = 'The AI market and GPU demand are growing.';
      expect(countOccurrences(text, 'AI')).toBe(1);
      expect(countOccurrences(text, 'GPU')).toBe(1);
    });
  });
});

describe('highlightWord', () => {
  it('should wrap matches in mark tags', () => {
    const text = 'Revenue increased.';
    const result = highlightWord(text, 'revenue');
    expect(result).toContain('<mark');
    expect(result).toContain('Revenue');
    expect(result).toContain('</mark>');
  });

  it('should preserve original case in highlights', () => {
    const text = 'REVENUE and Revenue and revenue';
    const result = highlightWord(text, 'revenue');
    expect(result).toContain('REVENUE');
    expect(result).toContain('Revenue');
    expect(result).toContain('revenue');
  });

  it('should return original text for empty word', () => {
    const text = 'Some text here';
    expect(highlightWord(text, '')).toBe(text);
    expect(highlightWord(text, '   ')).toBe(text);
  });

  it('should return original text for no matches', () => {
    const text = 'No matches here';
    expect(highlightWord(text, 'xyz')).toBe(text);
  });
});

describe('extractCompanyName', () => {
  it('should extract company name from Kalshi title format', () => {
    expect(extractCompanyName('What will Netflix say during...', 'fallback')).toBe('Netflix');
    expect(extractCompanyName('What will Apple say on their...', 'fallback')).toBe('Apple');
    expect(extractCompanyName('What will NVIDIA say...', 'fallback')).toBe('NVIDIA');
  });

  it('should be case insensitive', () => {
    expect(extractCompanyName('what will amazon say...', 'fallback')).toBe('amazon');
  });

  it('should return fallback for non-matching titles', () => {
    expect(extractCompanyName('Some other title', 'DefaultCorp')).toBe('DefaultCorp');
    expect(extractCompanyName('', 'Empty')).toBe('Empty');
  });
});

describe('getQuarterOptions', () => {
  it('should return all four quarters', () => {
    const quarters = getQuarterOptions();
    expect(quarters).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
});

describe('getYearOptions', () => {
  it('should return last 5 years', () => {
    const years = getYearOptions();
    expect(years.length).toBe(5);

    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(currentYear);
    expect(years[4]).toBe(currentYear - 4);
  });

  it('should be in descending order', () => {
    const years = getYearOptions();
    for (let i = 0; i < years.length - 1; i++) {
      expect(years[i]).toBeGreaterThan(years[i + 1]);
    }
  });
});

describe('formatCents', () => {
  it('should format cents to dollars', () => {
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(50)).toBe('$0.50');
    expect(formatCents(1234)).toBe('$12.34');
  });

  it('should handle zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('should handle large amounts', () => {
    expect(formatCents(100000)).toBe('$1000.00');
  });
});

describe('calculateBet', () => {
  it('should calculate cost and payout correctly', () => {
    const result = calculateBet(10, 50);
    expect(result.cost).toBe(5); // 10 * 50 / 100 = $5
    expect(result.payout).toBe(10); // 10 contracts = $10 max payout
  });

  it('should handle edge cases', () => {
    const result1 = calculateBet(1, 1);
    expect(result1.cost).toBe(0.01);
    expect(result1.payout).toBe(1);

    const result2 = calculateBet(100, 99);
    expect(result2.cost).toBe(99);
    expect(result2.payout).toBe(100);
  });
});
