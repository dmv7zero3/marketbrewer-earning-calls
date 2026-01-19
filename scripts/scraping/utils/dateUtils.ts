/**
 * Date Utilities for Transcript Validation
 *
 * Provides date parsing, plausibility checks, and earnings season validation.
 * Handles fiscal year offsets and timezone considerations.
 */

/**
 * Quarter to typical reporting months mapping
 * Earnings calls typically happen in the month after the quarter ends
 *
 * Calendar Year Quarters:
 * Q1 (Jan-Mar) -> Reported in Apr-May
 * Q2 (Apr-Jun) -> Reported in Jul-Aug
 * Q3 (Jul-Sep) -> Reported in Oct-Nov
 * Q4 (Oct-Dec) -> Reported in Jan-Feb (of next year)
 */
export const QUARTER_REPORTING_MONTHS: Record<string, number[]> = {
  Q1: [3, 4], // April, May (0-indexed: 3, 4)
  Q2: [6, 7], // July, August
  Q3: [9, 10], // October, November
  Q4: [0, 1], // January, February (next year)
};

/**
 * Extended reporting window with tolerance
 * Some companies report earlier or later
 */
export const QUARTER_REPORTING_MONTHS_EXTENDED: Record<string, number[]> = {
  Q1: [2, 3, 4, 5], // Mar-Jun
  Q2: [5, 6, 7, 8], // Jun-Sep
  Q3: [8, 9, 10, 11], // Sep-Dec
  Q4: [0, 1, 2, 11], // Jan-Mar + Dec (late Q4 reports)
};

export interface DateParseResult {
  success: boolean;
  date: Date | null;
  originalFormat: string;
  error?: string;
}

/**
 * Parse various date formats commonly found in earnings transcripts
 *
 * Supported formats:
 * - ISO: 2026-01-21, 2026-01-21T21:00:00Z
 * - US: January 21, 2026 / Jan 21, 2026 / 01/21/2026
 * - UK: 21 January 2026 / 21 Jan 2026
 * - With time: Jan 21, 2026 4:30 PM ET
 */
export function parseDate(dateStr: string): DateParseResult {
  if (!dateStr || typeof dateStr !== 'string') {
    return { success: false, date: null, originalFormat: '', error: 'Empty or invalid input' };
  }

  const trimmed = dateStr.trim();

  // Try ISO format first
  const isoDate = new Date(trimmed);
  if (!isNaN(isoDate.getTime()) && trimmed.match(/^\d{4}-\d{2}-\d{2}/)) {
    return { success: true, date: isoDate, originalFormat: 'ISO' };
  }

  // Month name patterns
  const monthNames: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  // Pattern: Month DD, YYYY (e.g., "January 21, 2026" or "Jan. 21, 2026")
  const usPattern = /(\w+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i;
  const usMatch = trimmed.match(usPattern);
  if (usMatch) {
    const month = monthNames[usMatch[1].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(usMatch[2], 10);
      const year = parseInt(usMatch[3], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return { success: true, date, originalFormat: 'US' };
      }
    }
  }

  // Pattern: DD Month YYYY (e.g., "21 January 2026")
  const ukPattern = /(\d{1,2})(?:st|nd|rd|th)?\s+(\w+),?\s+(\d{4})/i;
  const ukMatch = trimmed.match(ukPattern);
  if (ukMatch) {
    const day = parseInt(ukMatch[1], 10);
    const month = monthNames[ukMatch[2].toLowerCase()];
    const year = parseInt(ukMatch[3], 10);
    if (month !== undefined) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return { success: true, date, originalFormat: 'UK' };
      }
    }
  }

  // Pattern: MM/DD/YYYY
  const numericUsPattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const numericUsMatch = trimmed.match(numericUsPattern);
  if (numericUsMatch) {
    const month = parseInt(numericUsMatch[1], 10) - 1;
    const day = parseInt(numericUsMatch[2], 10);
    const year = parseInt(numericUsMatch[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return { success: true, date, originalFormat: 'MM/DD/YYYY' };
    }
  }

  // Fallback: try native Date parsing
  const fallbackDate = new Date(trimmed);
  if (!isNaN(fallbackDate.getTime())) {
    return { success: true, date: fallbackDate, originalFormat: 'fallback' };
  }

  return {
    success: false,
    date: null,
    originalFormat: 'unknown',
    error: `Could not parse date: ${trimmed}`,
  };
}

export interface PlausibilityResult {
  plausible: boolean;
  reason: string;
  expectedMonths: number[];
  actualMonth: number;
  yearAdjustment: number; // 0 = same year, 1 = next year (for Q4)
}

/**
 * Check if a date is plausible for a given quarter
 *
 * @param date - The earnings call date
 * @param quarter - Quarter string (Q1, Q2, Q3, Q4)
 * @param fiscalYear - The fiscal year of the quarter
 * @param strict - If true, use narrow reporting window; if false, use extended
 */
export function isDatePlausible(
  date: Date,
  quarter: string,
  fiscalYear: number,
  strict: boolean = false
): PlausibilityResult {
  const normalizedQuarter = quarter.toUpperCase().replace(/\s+/g, '');
  const quarterKey = normalizedQuarter.match(/Q[1-4]/)?.[0];

  if (!quarterKey) {
    return {
      plausible: false,
      reason: `Invalid quarter format: ${quarter}`,
      expectedMonths: [],
      actualMonth: date.getMonth(),
      yearAdjustment: 0,
    };
  }

  const reportingMonths = strict
    ? QUARTER_REPORTING_MONTHS[quarterKey]
    : QUARTER_REPORTING_MONTHS_EXTENDED[quarterKey];

  const actualMonth = date.getMonth();
  const actualYear = date.getFullYear();

  // For Q4, the report comes in January/February of the NEXT year
  let expectedYear = fiscalYear;
  let yearAdjustment = 0;

  if (quarterKey === 'Q4') {
    // Q4 2025 is reported in Jan/Feb 2026
    if (actualMonth <= 2) {
      // Jan, Feb, Mar
      expectedYear = fiscalYear + 1;
      yearAdjustment = 1;
    }
  }

  // Check year
  const yearMatch = actualYear === expectedYear;
  if (!yearMatch) {
    // Allow 1 year tolerance for edge cases
    if (Math.abs(actualYear - expectedYear) > 1) {
      return {
        plausible: false,
        reason: `Year mismatch: expected ~${expectedYear}, got ${actualYear}`,
        expectedMonths: reportingMonths,
        actualMonth,
        yearAdjustment,
      };
    }
  }

  // Check month
  const monthMatch = reportingMonths.includes(actualMonth);

  if (!monthMatch) {
    return {
      plausible: false,
      reason: `Month ${actualMonth + 1} not in expected reporting window for ${quarterKey}`,
      expectedMonths: reportingMonths,
      actualMonth,
      yearAdjustment,
    };
  }

  return {
    plausible: true,
    reason: 'Date is within expected reporting window',
    expectedMonths: reportingMonths,
    actualMonth,
    yearAdjustment,
  };
}

/**
 * Check if two dates are within a tolerance window
 *
 * @param date1 - First date
 * @param date2 - Second date
 * @param toleranceHours - Maximum hours difference (default 24)
 */
export function datesWithinTolerance(
  date1: Date,
  date2: Date,
  toleranceHours: number = 24
): { withinTolerance: boolean; differenceHours: number } {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffHours = diffMs / (1000 * 60 * 60);

  return {
    withinTolerance: diffHours <= toleranceHours,
    differenceHours: diffHours,
  };
}

/**
 * Format date for display in audit logs
 */
export function formatDateForAudit(date: Date): string {
  return date.toISOString();
}

/**
 * Get the expected reporting date range for a quarter
 */
export function getExpectedReportingWindow(
  quarter: string,
  fiscalYear: number
): { start: Date; end: Date } | null {
  const quarterKey = quarter.toUpperCase().match(/Q[1-4]/)?.[0];
  if (!quarterKey) return null;

  const months = QUARTER_REPORTING_MONTHS_EXTENDED[quarterKey];
  const year = quarterKey === 'Q4' ? fiscalYear + 1 : fiscalYear;

  // Get min and max months, handling year wrap
  const sortedMonths = [...months].sort((a, b) => a - b);
  const startMonth = sortedMonths[0];
  const endMonth = sortedMonths[sortedMonths.length - 1];

  // Handle December (11) to January (0) wrap for Q4
  let startYear = year;
  let endYear = year;
  if (quarterKey === 'Q4' && months.includes(11)) {
    // December is in the previous year
    startYear = fiscalYear;
  }

  return {
    start: new Date(startYear, startMonth, 1),
    end: new Date(endYear, endMonth + 1, 0), // Last day of end month
  };
}

/**
 * Determine fiscal quarter from a date
 * Assumes calendar fiscal year (Jan-Dec)
 */
export function getFiscalQuarterFromDate(date: Date): { quarter: string; fiscalYear: number } {
  const month = date.getMonth();
  const year = date.getFullYear();

  // Determine which quarter this earnings call is FOR
  // Jan-Feb reports are for previous year's Q4
  // Apr-May reports are for Q1
  // Jul-Aug reports are for Q2
  // Oct-Nov reports are for Q3

  if (month <= 1) {
    // Jan, Feb -> Q4 of previous year
    return { quarter: 'Q4', fiscalYear: year - 1 };
  } else if (month <= 4) {
    // Mar, Apr, May -> Q1
    return { quarter: 'Q1', fiscalYear: year };
  } else if (month <= 7) {
    // Jun, Jul, Aug -> Q2
    return { quarter: 'Q2', fiscalYear: year };
  } else if (month <= 10) {
    // Sep, Oct, Nov -> Q3
    return { quarter: 'Q3', fiscalYear: year };
  } else {
    // Dec -> Q4 (early report) or Q3 (late report)
    return { quarter: 'Q4', fiscalYear: year };
  }
}
