/**
 * Seeking Alpha Transcript Scraping Module
 *
 * Main entry point for scraping earnings call transcripts.
 * Provides a complete pipeline: scrape -> parse -> validate -> audit -> save.
 *
 * Usage:
 *   bun run scripts/scraping/index.ts --ticker AAPL --quarter Q4 --year 2025
 */

import 'dotenv/config';

// Utils
export * from './utils';

// Validators
export * from './validators';

// Audit
export * from './audit';

// Parser
export {
  parseTranscriptHtml,
  isTranscriptPage,
  extractTickerFromUrl,
  detectPaywall,
  type ParseResult,
} from './parser';

// Scraper
export {
  TranscriptScraper,
  buildTranscriptUrl,
  scraper,
  type ScraperConfig,
  type ScrapeResult,
} from './scraper';

// Re-export key types
export {
  type ExtractedTranscriptData,
  type ExpectedTranscriptData,
  type CombinedValidationResult,
} from './validators/types';

import { TranscriptScraper, type ScrapeResult } from './scraper';
import {
  runValidationPipeline,
  type CombinedValidationResult,
  type ExpectedTranscriptData,
  type CrossReferenceData,
  formatValidationResult,
} from './validators';
import { AuditLogger, createAuditLogEntry, type AuditLogEntry } from './audit';
import { generateContentHash, generateRawHtmlHash } from './utils/hashUtils';

/**
 * Complete scraping pipeline result
 */
export interface PipelineResult {
  success: boolean;
  scrapeResult: ScrapeResult;
  validationResult: CombinedValidationResult | null;
  auditEntry: AuditLogEntry | null;
  shouldSave: boolean;
  errors: string[];
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  // Expected data for validation
  expected: ExpectedTranscriptData;

  // Cross-reference data
  crossRef: CrossReferenceData;

  // Options
  dryRun?: boolean; // Don't save to DB
  verbose?: boolean;
}

/**
 * Run complete scraping pipeline
 *
 * 1. Scrape the page
 * 2. Parse HTML to extract data
 * 3. Validate against expected values
 * 4. Log audit entry
 * 5. Determine if data should be saved
 */
export async function runScrapingPipeline(
  url: string,
  config: PipelineConfig,
  scraper?: TranscriptScraper,
  auditLogger?: AuditLogger
): Promise<PipelineResult> {
  const scraperInstance = scraper || new TranscriptScraper();
  const logger = auditLogger || new AuditLogger({ console: config.verbose ?? false });
  const errors: string[] = [];

  // Step 1: Scrape
  console.log(`\n=== Scraping: ${url} ===\n`);
  const scrapeResult = await scraperInstance.scrapeTranscript(url);

  if (!scrapeResult.success || !scrapeResult.data) {
    errors.push(...scrapeResult.errors);
    console.log('Scraping failed:', scrapeResult.errors.join('; '));

    return {
      success: false,
      scrapeResult,
      validationResult: null,
      auditEntry: null,
      shouldSave: false,
      errors,
    };
  }

  console.log('Scraping successful');
  console.log(`  Company: ${scrapeResult.data.companyName}`);
  console.log(`  Ticker: ${scrapeResult.data.ticker}`);
  console.log(`  Quarter: ${scrapeResult.data.quarter} ${scrapeResult.data.fiscalYear}`);
  console.log(`  Words: ${scrapeResult.data.wordCount}`);

  // Step 2: Validate
  console.log('\n=== Running Validation ===\n');
  const validationResult = runValidationPipeline(
    scrapeResult.data,
    config.expected,
    config.crossRef,
    { skipCrossReferenceIfEmpty: true }
  );

  if (config.verbose) {
    console.log(formatValidationResult(validationResult));
  } else {
    console.log(`Confidence: ${validationResult.confidence}%`);
    console.log(`Decision: ${validationResult.autoDecision.toUpperCase()}`);
    console.log(`Reasons: ${validationResult.reasons.join('; ')}`);
  }

  // Step 3: Create audit entry
  const auditEntry = createAuditLogEntry({
    sourceUrl: url,
    sourceTitle: scrapeResult.data.title,
    rawHtml: scrapeResult.rawHtml || '',
    rawHtmlHash: scrapeResult.rawHtmlHash || generateRawHtmlHash(scrapeResult.rawHtml || ''),
    extractedData: {
      companyName: scrapeResult.data.companyName,
      ticker: scrapeResult.data.ticker,
      quarter: scrapeResult.data.quarter,
      fiscalYear: scrapeResult.data.fiscalYear,
      callDate: scrapeResult.data.callDate,
      content: scrapeResult.data.content,
      participants: scrapeResult.data.participants,
    },
    expectedData: {
      companyName: config.expected.companyName,
      ticker: config.expected.ticker,
      quarter: config.expected.quarter,
      fiscalYear: config.expected.fiscalYear,
      kalshiEventDate: config.expected.expectedDate || null,
    },
    validationResult,
    savedToDb: false, // Updated after actual save
    transcriptId: null,
    verificationStatus: validationResult.autoDecision === 'approve' ? 'verified' : 'pending',
    contentHash: scrapeResult.data.content
      ? generateContentHash(scrapeResult.data.content)
      : null,
  });

  // Log audit entry
  await logger.log(auditEntry);

  // Step 4: Determine if should save
  const shouldSave = !config.dryRun && validationResult.autoDecision !== 'reject';

  if (config.dryRun) {
    console.log('\n[DRY RUN] Would save:', shouldSave);
  }

  return {
    success: true,
    scrapeResult,
    validationResult,
    auditEntry,
    shouldSave,
    errors,
  };
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : undefined;
  };

  const ticker = getArg('ticker');
  const quarter = getArg('quarter');
  const year = getArg('year');
  const url = getArg('url');
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (!url && (!ticker || !quarter || !year)) {
    console.log(`
Usage: bun run scripts/scraping/index.ts [options]

Options:
  --url <url>         Direct URL to scrape
  --ticker <symbol>   Stock ticker (e.g., AAPL)
  --quarter <Q1-Q4>   Fiscal quarter
  --year <YYYY>       Fiscal year
  --dry-run           Don't save to database
  --verbose           Show detailed output

Examples:
  bun run scripts/scraping/index.ts --url https://seekingalpha.com/article/...
  bun run scripts/scraping/index.ts --ticker AAPL --quarter Q4 --year 2025
    `);
    process.exit(1);
  }

  // Build URL if not provided
  const targetUrl = url || `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`;

  // Build expected data
  const expected: ExpectedTranscriptData = {
    companyName: ticker || 'Unknown', // Will be replaced with real name
    ticker: ticker || '',
    quarter: quarter || '',
    fiscalYear: year ? parseInt(year, 10) : new Date().getFullYear(),
  };

  // Empty cross-reference (would be populated from DynamoDB in real usage)
  const crossRef: CrossReferenceData = {
    existingContentHashes: [],
  };

  // Run pipeline
  const scraper = new TranscriptScraper({ headless: !verbose });

  try {
    await scraper.initialize();

    const result = await runScrapingPipeline(targetUrl, {
      expected,
      crossRef,
      dryRun,
      verbose,
    }, scraper);

    console.log('\n=== Pipeline Complete ===');
    console.log(`Success: ${result.success}`);
    console.log(`Should Save: ${result.shouldSave}`);

    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join('; ')}`);
    }
  } finally {
    await scraper.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
