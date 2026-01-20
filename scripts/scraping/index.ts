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
  extractTranscriptLinks,
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
  buildCrossReferenceFromTranscripts,
  formatValidationResult,
} from './validators';
import { AuditLogger, createAuditLogEntry, type AuditLogEntry } from './audit';
import { generateContentHash, generateRawHtmlHash } from './utils/hashUtils';
import { parseDate } from './utils/dateUtils';
import {
  getTranscriptsForEvent,
  saveTranscript,
  updateEarningsEventDate,
} from '../../server/lib/dynamodb';

/**
 * Complete scraping pipeline result
 */
export interface PipelineResult {
  success: boolean;
  scrapeResult: ScrapeResult;
  validationResult: CombinedValidationResult | null;
  auditEntry: AuditLogEntry | null;
  savedTranscriptId: string | null;
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
  saveHandler?: (params: {
    extracted: ExtractedTranscriptData;
    validation: CombinedValidationResult;
    audit: AuditLogEntry;
    contentHash: string | null;
    rawHtmlHash: string | null;
  }) => Promise<{
    transcriptId: string | null;
    verificationStatus: 'pending' | 'verified' | 'rejected';
  }>;
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
      savedTranscriptId: null,
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
    rawHtmlHash:
      scrapeResult.rawHtmlHash || generateRawHtmlHash(scrapeResult.rawHtml || ''),
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
    verificationStatus:
      validationResult.autoDecision === 'approve' ? 'verified' : 'pending',
    contentHash: scrapeResult.data.content
      ? generateContentHash(scrapeResult.data.content)
      : null,
  });

  // Step 4: Determine if should save
  let shouldSave = !config.dryRun && validationResult.autoDecision !== 'reject';
  let savedTranscriptId: string | null = null;

  if (shouldSave && config.saveHandler) {
    try {
      const saveResult = await config.saveHandler({
        extracted: scrapeResult.data,
        validation: validationResult,
        audit: auditEntry,
        contentHash: auditEntry.contentHash,
        rawHtmlHash: auditEntry.rawHtmlHash,
      });

      savedTranscriptId = saveResult.transcriptId;
      auditEntry.transcriptId = saveResult.transcriptId;
      auditEntry.decision.savedToDb = true;
      auditEntry.decision.verificationStatus = saveResult.verificationStatus;
    } catch (error) {
      shouldSave = false;
      const message = error instanceof Error ? error.message : 'Unknown save error';
      errors.push(`Save failed: ${message}`);
      auditEntry.error = {
        type: 'save_error',
        message,
        stack: error instanceof Error ? error.stack : undefined,
        retryCount: 0,
      };
    }
  }

  // Log audit entry (after save attempt)
  await logger.log(auditEntry);

  if (config.dryRun) {
    console.log('\n[DRY RUN] Would save:', shouldSave);
  }

  return {
    success: true,
    scrapeResult,
    validationResult,
    auditEntry,
    savedTranscriptId,
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
  const company = getArg('company');
  const eventTicker = getArg('event-ticker');
  const expectedDateArg = getArg('expected-date');
  const save = args.includes('--save');
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  if (!url && (!ticker || !quarter || !year)) {
    console.log(`
Usage: bun run scripts/scraping/index.ts [options]

Options:
  --url <url>         Direct URL to scrape
  --company <name>    Company name for validation/saving
  --event-ticker <id> Kalshi event ticker (required for --save)
  --expected-date <d> Expected earnings date (YYYY-MM-DD)
  --ticker <symbol>   Stock ticker (e.g., AAPL)
  --quarter <Q1-Q4>   Fiscal quarter
  --year <YYYY>       Fiscal year
  --save              Persist validated transcript to DynamoDB
  --dry-run           Don't save to database
  --verbose           Show detailed output

Examples:
  bun run scripts/scraping/index.ts --url https://seekingalpha.com/article/...
  bun run scripts/scraping/index.ts --ticker AAPL --quarter Q4 --year 2025
    `);
    process.exit(1);
  }

  // Build URL if not provided
  const targetUrl =
    url || `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`;

  // Build expected data
  const expectedDate = expectedDateArg ? parseDate(expectedDateArg) : null;
  const expected: ExpectedTranscriptData = {
    companyName: company || ticker || 'Unknown',
    ticker: ticker || '',
    quarter: quarter || '',
    fiscalYear: year ? parseInt(year, 10) : new Date().getFullYear(),
    expectedDate: expectedDate?.success ? (expectedDate.date ?? undefined) : undefined,
  };

  // Cross-reference data from DynamoDB (if event ticker provided)
  let crossRef: CrossReferenceData = { existingContentHashes: [] };
  if (eventTicker) {
    const existingTranscripts = await getTranscriptsForEvent(eventTicker);
    crossRef = {
      ...crossRef,
      ...buildCrossReferenceFromTranscripts(existingTranscripts),
      kalshiEventDate: expected.expectedDate,
      kalshiEventTicker: eventTicker,
    };
  }

  // Run pipeline
  const scraper = new TranscriptScraper({ headless: !verbose });

  try {
    await scraper.initialize();

    const result = await runScrapingPipeline(
      targetUrl,
      {
        expected,
        crossRef,
        dryRun: dryRun || !save,
        verbose,
        saveHandler: save
          ? async ({ extracted, validation, audit, contentHash, rawHtmlHash }) => {
              if (!eventTicker) {
                throw new Error('Missing --event-ticker (required for --save)');
              }

              const parsedDate = extracted.callDate
                ? parseDate(extracted.callDate)
                : null;
              if (!parsedDate?.success || !parsedDate.date) {
                throw new Error(
                  'Call date could not be parsed; refusing to save transcript'
                );
              }

              const normalizedDate = parsedDate.date.toISOString().split('T')[0];
              const verificationStatus =
                validation.autoDecision === 'approve' ? 'verified' : 'pending';

              let sourceDomain: string | undefined;
              try {
                sourceDomain = new URL(extracted.sourceUrl).hostname;
              } catch {
                sourceDomain = undefined;
              }

              const transcript = await saveTranscript({
                eventTicker,
                company: expected.companyName,
                date: normalizedDate,
                quarter: extracted.quarter || expected.quarter,
                year: extracted.fiscalYear || expected.fiscalYear,
                content: extracted.content || '',
                wordCount: extracted.wordCount,
                verificationStatus,
                verifiedAt:
                  verificationStatus === 'verified'
                    ? new Date().toISOString()
                    : undefined,
                verifiedBy: verificationStatus === 'verified' ? 'auto' : undefined,
                sourceUrl: extracted.sourceUrl,
                sourceTitle: extracted.title || undefined,
                sourceDate: extracted.callDate || undefined,
                sourceTicker: extracted.ticker || undefined,
                sourceDomain,
                parsedCompany: extracted.companyName || undefined,
                parsedQuarter: extracted.quarter || undefined,
                parsedEarningsDate: parsedDate.date.toISOString(),
                contentHash: contentHash || undefined,
                rawHtmlHash: rawHtmlHash || undefined,
                validationDecision: validation.autoDecision,
                validationConfidence: validation.confidence,
                validationReasons: validation.reasons,
                auditId: audit.auditId,
              });

              if (verificationStatus === 'verified') {
                await updateEarningsEventDate(expected.companyName, eventTicker, {
                  eventDate: parsedDate.date.toISOString(),
                  source: 'transcript',
                  verified: true,
                  confidence: validation.confidence,
                });
              }

              return { transcriptId: transcript.SK, verificationStatus };
            }
          : undefined,
      },
      scraper
    );

    console.log('\n=== Pipeline Complete ===');
    console.log(`Success: ${result.success}`);
    console.log(`Should Save: ${result.shouldSave}`);
    if (result.savedTranscriptId) {
      console.log(`Saved Transcript: ${result.savedTranscriptId}`);
    }

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
