/**
 * Audit Logger
 *
 * Writes audit log entries to storage for compliance and debugging.
 * Supports multiple backends: console, file, and (future) DynamoDB.
 */

import fs from 'fs';
import path from 'path';
import { type AuditLogEntry, type AuditSummary } from './types';

export interface AuditLoggerConfig {
  // Output destinations
  console: boolean;
  file: boolean;
  filePath?: string;

  // Verbosity
  verbose: boolean;

  // Storage
  maxEntriesInMemory?: number;
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
  console: true,
  file: true,
  filePath: './audit-logs',
  verbose: false,
  maxEntriesInMemory: 1000,
};

/**
 * Audit Logger class
 *
 * Handles writing and reading audit log entries.
 */
export class AuditLogger {
  private config: AuditLoggerConfig;
  private entries: AuditLogEntry[] = [];

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure audit directory exists
    if (this.config.file && this.config.filePath) {
      const dir = path.resolve(this.config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Log an audit entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    // Add to in-memory store
    this.entries.push(entry);

    // Trim if over limit
    if (this.config.maxEntriesInMemory && this.entries.length > this.config.maxEntriesInMemory) {
      this.entries = this.entries.slice(-this.config.maxEntriesInMemory);
    }

    // Console output
    if (this.config.console) {
      this.logToConsole(entry);
    }

    // File output
    if (this.config.file) {
      await this.logToFile(entry);
    }
  }

  /**
   * Log entry to console
   */
  private logToConsole(entry: AuditLogEntry): void {
    const prefix = this.getDecisionEmoji(entry.decision.autoDecision);
    const confidence = `${entry.validation.confidence}%`;

    // Basic log line
    console.log(
      `${prefix} [${entry.auditId}] ${entry.extraction.companyName || 'Unknown'} ` +
        `${entry.extraction.quarter || '?'} ${entry.extraction.fiscalYear || '?'} - ` +
        `${entry.decision.autoDecision.toUpperCase()} (${confidence})`
    );

    if (this.config.verbose) {
      // Detailed output
      console.log(`   URL: ${entry.sourceUrl}`);
      console.log(
        `   Validation: L1=${entry.validation.layer1Passed ? 'PASS' : 'FAIL'} ` +
          `L2=${entry.validation.layer2Passed ? 'PASS' : 'FAIL'} ` +
          `L3=${entry.validation.layer3Passed ? 'PASS' : 'FAIL'}`
      );
      console.log(
        `   Errors: ${entry.validation.errorCount.critical}C / ` +
          `${entry.validation.errorCount.major}M / ` +
          `${entry.validation.errorCount.minor}m`
      );

      if (entry.validation.errors.length > 0) {
        console.log('   Details:');
        for (const error of entry.validation.errors.slice(0, 5)) {
          console.log(`     - [L${error.layer}/${error.severity}] ${error.field}: ${error.message}`);
        }
        if (entry.validation.errors.length > 5) {
          console.log(`     ... and ${entry.validation.errors.length - 5} more`);
        }
      }

      console.log('');
    }
  }

  /**
   * Log entry to file
   */
  private async logToFile(entry: AuditLogEntry): Promise<void> {
    if (!this.config.filePath) return;

    const date = new Date().toISOString().split('T')[0];
    const filename = `audit-${date}.jsonl`;
    const filepath = path.join(this.config.filePath, filename);

    const line = JSON.stringify(entry) + '\n';

    fs.appendFileSync(filepath, line, 'utf8');
  }

  /**
   * Get emoji for decision type
   */
  private getDecisionEmoji(decision: string): string {
    switch (decision) {
      case 'approve':
        return '\u2705'; // Green check
      case 'review':
        return '\u26A0\uFE0F'; // Warning
      case 'reject':
        return '\u274C'; // Red X
      default:
        return '\u2753'; // Question mark
    }
  }

  /**
   * Get all entries in memory
   */
  getEntries(): AuditLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by decision type
   */
  getEntriesByDecision(decision: 'approve' | 'review' | 'reject'): AuditLogEntry[] {
    return this.entries.filter((e) => e.decision.autoDecision === decision);
  }

  /**
   * Get entries pending human review
   */
  getPendingReview(): AuditLogEntry[] {
    return this.entries.filter(
      (e) => e.decision.autoDecision === 'review' && !e.humanReview
    );
  }

  /**
   * Generate summary statistics
   */
  generateSummary(startDate?: Date, endDate?: Date): AuditSummary {
    let entries = this.entries;

    // Filter by date range if provided
    if (startDate || endDate) {
      entries = entries.filter((e) => {
        const timestamp = new Date(e.timestamp);
        if (startDate && timestamp < startDate) return false;
        if (endDate && timestamp > endDate) return false;
        return true;
      });
    }

    const successful = entries.filter((e) => !e.error);
    const failed = entries.filter((e) => !!e.error);

    // Decision counts
    const approved = entries.filter((e) => e.decision.autoDecision === 'approve').length;
    const review = entries.filter((e) => e.decision.autoDecision === 'review').length;
    const rejected = entries.filter((e) => e.decision.autoDecision === 'reject').length;

    // Validation pass rates
    const layer1Pass = entries.filter((e) => e.validation.layer1Passed).length;
    const layer2Pass = entries.filter((e) => e.validation.layer2Passed).length;
    const layer3Pass = entries.filter((e) => e.validation.layer3Passed).length;

    // Average confidence
    const totalConfidence = entries.reduce((sum, e) => sum + e.validation.confidence, 0);
    const avgConfidence = entries.length > 0 ? totalConfidence / entries.length : 0;

    // Error counts
    const criticalCount = entries.reduce((sum, e) => sum + e.validation.errorCount.critical, 0);
    const majorCount = entries.reduce((sum, e) => sum + e.validation.errorCount.major, 0);
    const minorCount = entries.reduce((sum, e) => sum + e.validation.errorCount.minor, 0);

    // Top errors
    const errorMessages = new Map<string, number>();
    for (const entry of entries) {
      for (const error of entry.validation.errors) {
        const count = errorMessages.get(error.message) || 0;
        errorMessages.set(error.message, count + 1);
      }
    }
    const topErrors = Array.from(errorMessages.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Human review stats
    const pendingReview = entries.filter(
      (e) => e.decision.autoDecision === 'review' && !e.humanReview
    ).length;
    const humanVerified = entries.filter((e) => e.humanReview?.decision === 'verified').length;
    const humanRejected = entries.filter((e) => e.humanReview?.decision === 'rejected').length;

    return {
      period: {
        start: startDate?.toISOString() || entries[0]?.timestamp || '',
        end: endDate?.toISOString() || entries[entries.length - 1]?.timestamp || '',
      },
      totals: {
        attempts: entries.length,
        successful: successful.length,
        failed: failed.length,
      },
      decisions: {
        approved,
        review,
        rejected,
      },
      validation: {
        layer1PassRate: entries.length > 0 ? (layer1Pass / entries.length) * 100 : 0,
        layer2PassRate: entries.length > 0 ? (layer2Pass / entries.length) * 100 : 0,
        layer3PassRate: entries.length > 0 ? (layer3Pass / entries.length) * 100 : 0,
        averageConfidence: avgConfidence,
      },
      errors: {
        criticalCount,
        majorCount,
        minorCount,
        topErrors,
      },
      humanReview: {
        pending: pendingReview,
        verified: humanVerified,
        rejected: humanRejected,
      },
    };
  }

  /**
   * Print summary to console
   */
  printSummary(summary?: AuditSummary): void {
    const s = summary || this.generateSummary();

    console.log('\n=== Audit Summary ===\n');

    console.log('Totals:');
    console.log(`  Attempts: ${s.totals.attempts}`);
    console.log(`  Successful: ${s.totals.successful}`);
    console.log(`  Failed: ${s.totals.failed}`);

    console.log('\nDecisions:');
    console.log(`  Auto-approved: ${s.decisions.approved} (${((s.decisions.approved / s.totals.attempts) * 100 || 0).toFixed(1)}%)`);
    console.log(`  For review: ${s.decisions.review} (${((s.decisions.review / s.totals.attempts) * 100 || 0).toFixed(1)}%)`);
    console.log(`  Rejected: ${s.decisions.rejected} (${((s.decisions.rejected / s.totals.attempts) * 100 || 0).toFixed(1)}%)`);

    console.log('\nValidation Pass Rates:');
    console.log(`  Layer 1 (Extraction): ${s.validation.layer1PassRate.toFixed(1)}%`);
    console.log(`  Layer 2 (Semantic): ${s.validation.layer2PassRate.toFixed(1)}%`);
    console.log(`  Layer 3 (Cross-Ref): ${s.validation.layer3PassRate.toFixed(1)}%`);
    console.log(`  Average Confidence: ${s.validation.averageConfidence.toFixed(1)}%`);

    console.log('\nErrors:');
    console.log(`  Critical: ${s.errors.criticalCount}`);
    console.log(`  Major: ${s.errors.majorCount}`);
    console.log(`  Minor: ${s.errors.minorCount}`);

    if (s.errors.topErrors.length > 0) {
      console.log('\nTop Errors:');
      for (const error of s.errors.topErrors.slice(0, 5)) {
        console.log(`  - ${error.message} (${error.count}x)`);
      }
    }

    console.log('\nHuman Review:');
    console.log(`  Pending: ${s.humanReview.pending}`);
    console.log(`  Verified: ${s.humanReview.verified}`);
    console.log(`  Rejected: ${s.humanReview.rejected}`);

    console.log('');
  }

  /**
   * Load audit logs from file
   */
  async loadFromFile(filepath: string): Promise<AuditLogEntry[]> {
    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.trim().split('\n').filter((l) => l.length > 0);

    const entries: AuditLogEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditLogEntry;
        entries.push(entry);
      } catch {
        console.warn(`Failed to parse audit log line: ${line.substring(0, 100)}...`);
      }
    }

    return entries;
  }

  /**
   * Clear in-memory entries
   */
  clear(): void {
    this.entries = [];
  }
}

// Default logger instance
export const auditLogger = new AuditLogger();
