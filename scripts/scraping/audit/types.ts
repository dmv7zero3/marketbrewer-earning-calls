/**
 * Audit Trail Types
 *
 * Defines the schema for audit logs that track every scraping attempt,
 * validation result, and decision for forensic analysis.
 */

import { type CombinedValidationResult } from '../validators/types';

/**
 * Audit log entry for a scraping attempt
 */
export interface AuditLogEntry {
  // Identifiers
  auditId: string; // Unique ID for this audit entry
  transcriptId: string | null; // If saved, the transcript SK

  // Timestamps
  timestamp: string; // ISO timestamp when audit was created
  scrapedAt: string; // When the page was scraped
  validatedAt: string; // When validation completed
  decidedAt: string; // When decision was made

  // Source information
  sourceUrl: string;
  sourceTitle: string | null;
  sourceDomain: string;

  // Content fingerprints
  rawHtmlHash: string; // SHA-256 of raw HTML
  contentHash: string | null; // SHA-256 of extracted content
  rawHtmlSize: number; // Bytes

  // Extraction results
  extraction: {
    companyName: string | null;
    ticker: string | null;
    quarter: string | null;
    fiscalYear: number | null;
    callDate: string | null;
    wordCount: number;
    participantCount: number;
  };

  // Expected values (for comparison)
  expected: {
    companyName: string;
    ticker: string;
    quarter: string;
    fiscalYear: number;
    kalshiEventDate: string | null;
  };

  // Validation results
  validation: {
    layer1Passed: boolean;
    layer2Passed: boolean;
    layer3Passed: boolean;
    confidence: number;
    errorCount: {
      critical: number;
      major: number;
      minor: number;
    };
    warningCount: number;
    errors: Array<{
      layer: 1 | 2 | 3;
      field: string;
      severity: string;
      message: string;
    }>;
  };

  // Decision
  decision: {
    autoDecision: 'approve' | 'review' | 'reject';
    reasons: string[];
    savedToDb: boolean;
    verificationStatus: 'pending' | 'verified' | 'rejected' | null;
  };

  // Human review (if applicable)
  humanReview?: {
    reviewedAt: string;
    reviewedBy: string;
    decision: 'verified' | 'rejected';
    notes: string;
  };

  // Error tracking (if scraping failed)
  error?: {
    type: string;
    message: string;
    stack?: string;
    retryCount: number;
  };

  // Metadata
  metadata: {
    scrapingVersion: string;
    validatorVersion: string;
    environment: string;
  };
}

/**
 * Summary statistics for audit reporting
 */
export interface AuditSummary {
  period: {
    start: string;
    end: string;
  };
  totals: {
    attempts: number;
    successful: number;
    failed: number;
  };
  decisions: {
    approved: number;
    review: number;
    rejected: number;
  };
  validation: {
    layer1PassRate: number;
    layer2PassRate: number;
    layer3PassRate: number;
    averageConfidence: number;
  };
  errors: {
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    topErrors: Array<{
      message: string;
      count: number;
    }>;
  };
  humanReview: {
    pending: number;
    verified: number;
    rejected: number;
  };
}

/**
 * Create audit log entry from validation result
 */
export function createAuditLogEntry(
  params: {
    sourceUrl: string;
    sourceTitle: string | null;
    rawHtml: string;
    rawHtmlHash: string;
    extractedData: {
      companyName: string | null;
      ticker: string | null;
      quarter: string | null;
      fiscalYear: number | null;
      callDate: string | null;
      content: string | null;
      participants: string[];
    };
    expectedData: {
      companyName: string;
      ticker: string;
      quarter: string;
      fiscalYear: number;
      kalshiEventDate: Date | null;
    };
    validationResult: CombinedValidationResult;
    savedToDb: boolean;
    transcriptId: string | null;
    verificationStatus: 'pending' | 'verified' | 'rejected' | null;
    contentHash: string | null;
  }
): AuditLogEntry {
  const now = new Date().toISOString();

  // Parse source domain
  let sourceDomain = '';
  try {
    sourceDomain = new URL(params.sourceUrl).hostname;
  } catch {
    sourceDomain = 'unknown';
  }

  // Collect all errors from validation layers
  const allErrors: AuditLogEntry['validation']['errors'] = [];

  for (const error of params.validationResult.layer1.errors) {
    allErrors.push({
      layer: 1,
      field: error.field,
      severity: error.severity,
      message: error.message,
    });
  }

  for (const error of params.validationResult.layer2.errors) {
    allErrors.push({
      layer: 2,
      field: error.field,
      severity: error.severity,
      message: error.message,
    });
  }

  for (const error of params.validationResult.layer3.errors) {
    allErrors.push({
      layer: 3,
      field: error.field,
      severity: error.severity,
      message: error.message,
    });
  }

  // Count errors by severity
  const errorCounts = {
    critical: allErrors.filter((e) => e.severity === 'critical').length,
    major: allErrors.filter((e) => e.severity === 'major').length,
    minor: allErrors.filter((e) => e.severity === 'minor').length,
  };

  // Count warnings
  const warningCount =
    params.validationResult.layer1.warnings.length +
    params.validationResult.layer2.warnings.length +
    params.validationResult.layer3.warnings.length;

  return {
    auditId: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    transcriptId: params.transcriptId,

    timestamp: now,
    scrapedAt: now,
    validatedAt: now,
    decidedAt: now,

    sourceUrl: params.sourceUrl,
    sourceTitle: params.sourceTitle,
    sourceDomain,

    rawHtmlHash: params.rawHtmlHash,
    contentHash: params.contentHash,
    rawHtmlSize: params.rawHtml.length,

    extraction: {
      companyName: params.extractedData.companyName,
      ticker: params.extractedData.ticker,
      quarter: params.extractedData.quarter,
      fiscalYear: params.extractedData.fiscalYear,
      callDate: params.extractedData.callDate,
      wordCount: params.extractedData.content
        ? params.extractedData.content.split(/\s+/).filter((w) => w.length > 0).length
        : 0,
      participantCount: params.extractedData.participants.length,
    },

    expected: {
      companyName: params.expectedData.companyName,
      ticker: params.expectedData.ticker,
      quarter: params.expectedData.quarter,
      fiscalYear: params.expectedData.fiscalYear,
      kalshiEventDate: params.expectedData.kalshiEventDate?.toISOString() ?? null,
    },

    validation: {
      layer1Passed: params.validationResult.layer1.passed,
      layer2Passed: params.validationResult.layer2.passed,
      layer3Passed: params.validationResult.layer3.passed,
      confidence: params.validationResult.confidence,
      errorCount: errorCounts,
      warningCount,
      errors: allErrors,
    },

    decision: {
      autoDecision: params.validationResult.autoDecision,
      reasons: params.validationResult.reasons,
      savedToDb: params.savedToDb,
      verificationStatus: params.verificationStatus,
    },

    metadata: {
      scrapingVersion: '1.0.0',
      validatorVersion: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    },
  };
}
