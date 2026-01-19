/**
 * Validation Types
 *
 * Shared types for all validation layers.
 */

export type ValidationSeverity = 'critical' | 'major' | 'minor';

export interface ValidationError {
  field: string;
  expected: string;
  actual: string;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning' | 'info';
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  checksPerformed: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Combined validation result from all layers
 */
export interface CombinedValidationResult {
  layer1: ValidationResult; // Extraction validation
  layer2: ValidationResult; // Semantic validation
  layer3: ValidationResult; // Cross-reference validation
  confidence: number; // 0-100
  autoDecision: 'approve' | 'review' | 'reject';
  reasons: string[];
}

/**
 * Confidence scoring configuration
 */
export const CONFIDENCE_CONFIG = {
  baseScore: 100,
  deductions: {
    critical: 50, // Auto-reject if any critical fails
    major: 15,
    minor: 5,
  },
  thresholds: {
    autoApprove: 90,
    humanReview: 70,
    // Below 70 = auto-reject
  },
};

/**
 * Calculate confidence score from validation results
 */
export function calculateConfidence(results: ValidationResult[]): {
  score: number;
  hasCriticalFailure: boolean;
} {
  let score = CONFIDENCE_CONFIG.baseScore;
  let hasCriticalFailure = false;

  for (const result of results) {
    for (const error of result.errors) {
      switch (error.severity) {
        case 'critical':
          score -= CONFIDENCE_CONFIG.deductions.critical;
          hasCriticalFailure = true;
          break;
        case 'major':
          score -= CONFIDENCE_CONFIG.deductions.major;
          break;
        case 'minor':
          score -= CONFIDENCE_CONFIG.deductions.minor;
          break;
      }
    }
  }

  return {
    score: Math.max(0, score),
    hasCriticalFailure,
  };
}

/**
 * Determine auto decision based on confidence and critical failures
 */
export function determineAutoDecision(
  score: number,
  hasCriticalFailure: boolean
): 'approve' | 'review' | 'reject' {
  if (hasCriticalFailure) {
    return 'reject';
  }

  if (score >= CONFIDENCE_CONFIG.thresholds.autoApprove) {
    return 'approve';
  }

  if (score >= CONFIDENCE_CONFIG.thresholds.humanReview) {
    return 'review';
  }

  return 'reject';
}

/**
 * Extracted transcript data from parser
 */
export interface ExtractedTranscriptData {
  // Required fields
  companyName: string | null;
  ticker: string | null;
  quarter: string | null;
  fiscalYear: number | null;
  callDate: string | null;
  callTime: string | null;
  content: string | null;

  // Optional fields
  participants: string[];
  title: string | null;
  wordCount: number;

  // Source metadata
  sourceUrl: string;
  sourceTitle: string | null;
  rawHtml: string;
  extractedAt: string;
}

/**
 * Expected transcript data for validation
 */
export interface ExpectedTranscriptData {
  companyName: string;
  ticker: string;
  quarter: string;
  fiscalYear: number;
  expectedDate?: Date; // From Kalshi
}
