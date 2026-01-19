/**
 * HTML Parser for Seeking Alpha Transcripts
 *
 * Extracts structured data from Seeking Alpha earnings call transcript pages.
 * Uses DOM parsing with cheerio for server-side HTML processing.
 *
 * IMPORTANT: This parser is designed for Seeking Alpha's page structure.
 * If SA changes their HTML structure, this parser will need updates.
 */

import * as cheerio from 'cheerio';
import { type ExtractedTranscriptData } from './validators/types';
import { calculateWordCount } from './validators/extraction';
import { generateRawHtmlHash, generateContentHash } from './utils/hashUtils';

/**
 * CSS Selectors for Seeking Alpha transcript pages
 *
 * These may need to be updated if SA changes their page structure.
 * Keep this object centralized for easy maintenance.
 */
const SELECTORS = {
  // Article content
  articleBody: '[data-test-id="article-content"], .article-content, article[data-test-id="content-container"] [data-test-id="article-body"]',
  articleTitle: 'h1[data-test-id="post-title"], h1.article-title, article h1',

  // Transcript specific
  transcriptBody: '.sa-art-container, [data-test-id="article-content"]',

  // Metadata
  publishDate: 'time[datetime], [data-test-id="post-date"], .article-date',
  ticker: '[data-test-id="symbol-link"], a[href*="/symbol/"]',

  // Participants section
  participantsSection: 'h2:contains("Call Participants"), h3:contains("Call Participants"), strong:contains("Call Participants")',

  // Company info
  companyName: '[data-test-id="post-title"], .article-title',
};

/**
 * Parse result with extraction metadata
 */
export interface ParseResult {
  success: boolean;
  data: ExtractedTranscriptData | null;
  errors: string[];
  warnings: string[];
  selectors: {
    found: string[];
    missing: string[];
  };
}

/**
 * Parse Seeking Alpha transcript page HTML
 *
 * @param html - Raw HTML string from the page
 * @param sourceUrl - URL the HTML was fetched from
 * @returns ParseResult with extracted data or errors
 */
export function parseTranscriptHtml(html: string, sourceUrl: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const foundSelectors: string[] = [];
  const missingSelectors: string[] = [];

  if (!html || html.trim().length === 0) {
    return {
      success: false,
      data: null,
      errors: ['Empty HTML provided'],
      warnings: [],
      selectors: { found: [], missing: [] },
    };
  }

  const $ = cheerio.load(html);
  const extractedAt = new Date().toISOString();
  const rawHtmlHash = generateRawHtmlHash(html);

  // ===== EXTRACT TITLE =====
  let title: string | null = null;
  const titleEl = $(SELECTORS.articleTitle).first();
  if (titleEl.length > 0) {
    title = titleEl.text().trim();
    foundSelectors.push('articleTitle');
  } else {
    // Fallback: try document title
    title = $('title').text().trim().split('|')[0].trim() || null;
    if (title) {
      warnings.push('Used fallback title extraction from <title> tag');
    } else {
      missingSelectors.push('articleTitle');
    }
  }

  // ===== EXTRACT COMPANY NAME AND TICKER FROM TITLE =====
  let companyName: string | null = null;
  let ticker: string | null = null;
  let quarter: string | null = null;
  let fiscalYear: number | null = null;

  if (title) {
    // Pattern: "Company Name (TICKER) Q1 2025 Earnings Call Transcript"
    const titlePattern = /^(.+?)\s*\(([A-Z]{1,5}(?:\.[A-Z])?)\)\s*(Q[1-4])\s*(\d{4})/i;
    const titleMatch = title.match(titlePattern);

    if (titleMatch) {
      companyName = titleMatch[1].trim();
      ticker = titleMatch[2].toUpperCase();
      quarter = titleMatch[3].toUpperCase();
      fiscalYear = parseInt(titleMatch[4], 10);
    } else {
      // Try alternative patterns
      // Pattern: "TICKER Q1 2025 Earnings Call"
      const altPattern = /^([A-Z]{1,5})\s*(Q[1-4])\s*(\d{4})/i;
      const altMatch = title.match(altPattern);
      if (altMatch) {
        ticker = altMatch[1].toUpperCase();
        quarter = altMatch[2].toUpperCase();
        fiscalYear = parseInt(altMatch[3], 10);
        warnings.push('Company name not found in title, only ticker');
      }

      // Try to extract quarter and year separately
      if (!quarter) {
        const quarterPattern = /Q([1-4])\s*(?:FY)?(\d{4})/i;
        const quarterMatch = title.match(quarterPattern);
        if (quarterMatch) {
          quarter = `Q${quarterMatch[1]}`;
          fiscalYear = parseInt(quarterMatch[2], 10);
        }
      }
    }
  }

  // ===== EXTRACT TICKER FROM URL =====
  if (!ticker && sourceUrl) {
    // URL pattern: seekingalpha.com/symbol/AAPL/...
    const urlPattern = /\/symbol\/([A-Z]{1,5}(?:\.[A-Z])?)\//i;
    const urlMatch = sourceUrl.match(urlPattern);
    if (urlMatch) {
      ticker = urlMatch[1].toUpperCase();
      warnings.push('Ticker extracted from URL, not page content');
    }
  }

  // ===== EXTRACT TICKER FROM PAGE CONTENT =====
  if (!ticker) {
    const tickerEl = $(SELECTORS.ticker).first();
    if (tickerEl.length > 0) {
      const tickerText = tickerEl.text().trim().replace(/[\(\)]/g, '');
      if (/^[A-Z]{1,5}$/i.test(tickerText)) {
        ticker = tickerText.toUpperCase();
        foundSelectors.push('ticker');
      }
    } else {
      missingSelectors.push('ticker');
    }
  }

  // ===== EXTRACT CALL DATE =====
  let callDate: string | null = null;
  let callTime: string | null = null;

  const dateEl = $(SELECTORS.publishDate).first();
  if (dateEl.length > 0) {
    // Try datetime attribute first
    const datetime = dateEl.attr('datetime');
    if (datetime) {
      callDate = datetime;
      foundSelectors.push('publishDate');
    } else {
      // Parse text content
      callDate = dateEl.text().trim();
    }
  } else {
    // Try to find date in article
    const datePattern = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i;
    const bodyText = $('body').text();
    const dateMatch = bodyText.match(datePattern);
    if (dateMatch) {
      callDate = dateMatch[0];
      warnings.push('Date extracted from body text, not metadata');
    } else {
      missingSelectors.push('publishDate');
    }
  }

  // ===== EXTRACT TRANSCRIPT CONTENT =====
  let content: string | null = null;

  // Try primary content selector
  let contentEl = $(SELECTORS.transcriptBody).first();

  if (contentEl.length === 0) {
    contentEl = $(SELECTORS.articleBody).first();
  }

  if (contentEl.length > 0) {
    // Remove scripts, styles, and navigation elements
    contentEl.find('script, style, nav, header, footer, .paywall, .ad, [data-test-id="paywall"]').remove();

    // Get text content
    content = contentEl.text()
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    foundSelectors.push('transcriptBody');
  } else {
    // Fallback: try to get all paragraph text
    const paragraphs = $('article p, .article-content p').map((_, el) => $(el).text()).get();
    if (paragraphs.length > 0) {
      content = paragraphs.join('\n\n');
      warnings.push('Content extracted from paragraphs, not article body');
    } else {
      missingSelectors.push('transcriptBody');
      errors.push('Could not extract transcript content - selectors not found');
    }
  }

  // ===== EXTRACT PARTICIPANTS =====
  const participants: string[] = [];

  // Look for participants section
  const participantHeaders = $('h2, h3, strong').filter(function () {
    return $(this).text().toLowerCase().includes('call participants') ||
      $(this).text().toLowerCase().includes('conference call participants');
  });

  if (participantHeaders.length > 0) {
    // Get the list following the header
    const participantList = participantHeaders.first().next('ul, ol');
    if (participantList.length > 0) {
      participantList.find('li').each(function () {
        const name = $(this).text().trim();
        if (name.length > 0 && name.length < 200) {
          participants.push(name);
        }
      });
      foundSelectors.push('participantsSection');
    }
  }

  if (participants.length === 0) {
    // Try to find participants in content
    if (content) {
      // Look for patterns like "John Smith - CEO" or "Jane Doe, CFO"
      const participantPattern = /([A-Z][a-z]+\s+[A-Z][a-z]+)\s*[-–]\s*(CEO|CFO|President|Chief|VP|Vice President|Director|Analyst)/gi;
      let match;
      while ((match = participantPattern.exec(content)) !== null) {
        const participant = `${match[1]} - ${match[2]}`;
        if (!participants.includes(participant)) {
          participants.push(participant);
        }
      }
    }

    if (participants.length === 0) {
      warnings.push('Could not extract call participants');
    } else {
      warnings.push('Participants extracted from content patterns, not dedicated section');
    }
  }

  // ===== CALCULATE WORD COUNT =====
  const wordCount = content ? calculateWordCount(content) : 0;

  // ===== GENERATE CONTENT HASH =====
  const contentHash = content ? generateContentHash(content) : null;

  // ===== VALIDATE MINIMUM REQUIREMENTS =====
  if (!content) {
    errors.push('No transcript content could be extracted');
  } else if (wordCount < 100) {
    errors.push(`Content too short: ${wordCount} words. May be a preview or paywall page.`);
  }

  if (!companyName && !ticker) {
    errors.push('Neither company name nor ticker could be extracted');
  }

  // ===== BUILD RESULT =====
  const data: ExtractedTranscriptData = {
    companyName,
    ticker,
    quarter,
    fiscalYear,
    callDate,
    callTime,
    content,
    participants,
    title,
    wordCount,
    sourceUrl,
    sourceTitle: title,
    rawHtml: html,
    extractedAt,
  };

  return {
    success: errors.length === 0,
    data,
    errors,
    warnings,
    selectors: {
      found: foundSelectors,
      missing: missingSelectors,
    },
  };
}

/**
 * Check if HTML appears to be a Seeking Alpha transcript page
 */
export function isTranscriptPage(html: string): { isTranscript: boolean; confidence: number; reasons: string[] } {
  if (!html || html.length < 1000) {
    return { isTranscript: false, confidence: 0, reasons: ['HTML too short'] };
  }

  const $ = cheerio.load(html);
  const reasons: string[] = [];
  let score = 0;

  // Check for Seeking Alpha
  if (html.includes('seekingalpha.com') || html.includes('Seeking Alpha')) {
    score += 20;
    reasons.push('Seeking Alpha detected');
  }

  // Check for earnings-related title
  const title = $('title').text().toLowerCase();
  if (title.includes('earnings call') || title.includes('transcript')) {
    score += 30;
    reasons.push('Earnings call title detected');
  }

  // Check for Q1-Q4 quarter mention
  if (/Q[1-4]\s*\d{4}/i.test(html)) {
    score += 20;
    reasons.push('Quarter/year pattern found');
  }

  // Check for call participants section
  if (/call participants/i.test(html)) {
    score += 15;
    reasons.push('Call participants section found');
  }

  // Check for operator mentions
  if (/operator/i.test(html)) {
    score += 10;
    reasons.push('Operator mentions found');
  }

  // Check content length
  const textLength = $('body').text().length;
  if (textLength > 10000) {
    score += 5;
    reasons.push('Sufficient content length');
  }

  return {
    isTranscript: score >= 50,
    confidence: Math.min(100, score),
    reasons,
  };
}

/**
 * Extract just the company ticker from a URL
 */
export function extractTickerFromUrl(url: string): string | null {
  const pattern = /\/symbol\/([A-Z]{1,5}(?:\.[A-Z])?)\//i;
  const match = url.match(pattern);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Detect if page is behind a paywall
 */
export function detectPaywall(html: string): boolean {
  const $ = cheerio.load(html);

  // Check for common paywall indicators
  const paywallIndicators = [
    '[data-test-id="paywall"]',
    '.paywall',
    '.subscription-required',
    '.premium-content',
  ];

  for (const selector of paywallIndicators) {
    if ($(selector).length > 0) {
      return true;
    }
  }

  // Check for paywall text
  const text = $('body').text().toLowerCase();
  if (
    text.includes('subscribe to read') ||
    text.includes('premium article') ||
    text.includes('unlock this article')
  ) {
    return true;
  }

  return false;
}
