/**
 * Web Scraper for Seeking Alpha Transcripts
 *
 * Uses Puppeteer for browser automation with authenticated sessions.
 * Implements rate limiting, retry logic, and safety measures.
 *
 * IMPORTANT: Requires valid Seeking Alpha Premium subscription.
 */

import puppeteer, { type Browser, type Page, type Cookie } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import {
  parseTranscriptHtml,
  isTranscriptPage,
  detectPaywall,
  extractTranscriptLinks,
} from './parser';
import { type ExtractedTranscriptData } from './validators/types';
import { generateRawHtmlHash } from './utils/hashUtils';

/**
 * Scraper configuration
 */
export interface ScraperConfig {
  // Rate limiting
  requestsPerMinute: number;
  pauseBetweenRequests: number; // ms
  maxRetries: number;
  retryDelay: number; // ms

  // Session management
  cookiesPath?: string;
  maxRequestsPerSession: number;

  // Safety
  maxDailyRequests: number;
  headless: boolean;
  timeout: number; // ms

  // Storage
  storeRawHtml: boolean;
  rawHtmlPath?: string;
}

const DEFAULT_CONFIG: ScraperConfig = {
  requestsPerMinute: 2,
  pauseBetweenRequests: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 60000, // 1 minute

  cookiesPath: './scraper-cookies.json',
  maxRequestsPerSession: 50,

  maxDailyRequests: 100,
  headless: true,
  timeout: 60000, // 1 minute

  storeRawHtml: true,
  rawHtmlPath: './raw-html',
};

/**
 * Scrape result
 */
export interface ScrapeResult {
  success: boolean;
  data: ExtractedTranscriptData | null;
  rawHtml: string | null;
  rawHtmlHash: string | null;
  errors: string[];
  warnings: string[];
  timing: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
  retryCount: number;
}

/**
 * Rate limiter for scraping requests
 */
class RateLimiter {
  private requestTimes: number[] = [];
  private dailyCount: number = 0;
  private lastResetDate: string = '';

  constructor(
    private requestsPerMinute: number,
    private maxDailyRequests: number
  ) {}

  async waitForSlot(): Promise<void> {
    // Reset daily counter if new day
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyCount = 0;
      this.lastResetDate = today;
    }

    // Check daily limit
    if (this.dailyCount >= this.maxDailyRequests) {
      throw new Error(`Daily request limit (${this.maxDailyRequests}) reached`);
    }

    // Clean old request times (older than 1 minute)
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimes = this.requestTimes.filter((t) => t > oneMinuteAgo);

    // Wait if at rate limit
    if (this.requestTimes.length >= this.requestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = oldestRequest + 60000 - Date.now();
      if (waitTime > 0) {
        console.log(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
      }
    }

    // Record this request
    this.requestTimes.push(Date.now());
    this.dailyCount++;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats(): { requestsInLastMinute: number; dailyCount: number } {
    const oneMinuteAgo = Date.now() - 60000;
    const requestsInLastMinute = this.requestTimes.filter((t) => t > oneMinuteAgo).length;
    return { requestsInLastMinute, dailyCount: this.dailyCount };
  }
}

/**
 * Seeking Alpha Transcript Scraper
 */
export class TranscriptScraper {
  private config: ScraperConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private rateLimiter: RateLimiter;
  private sessionRequestCount: number = 0;

  constructor(config: Partial<ScraperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(
      this.config.requestsPerMinute,
      this.config.maxDailyRequests
    );

    // Ensure raw HTML directory exists
    if (this.config.storeRawHtml && this.config.rawHtmlPath) {
      const dir = path.resolve(this.config.rawHtmlPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Initialize browser and load session
   */
  async initialize(): Promise<void> {
    console.log('Initializing browser...');

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    this.page = await this.browser.newPage();

    // Set realistic viewport and user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Load cookies if available
    await this.loadCookies();

    console.log('Browser initialized');
  }

  /**
   * Load cookies from file
   */
  private async loadCookies(): Promise<void> {
    if (!this.config.cookiesPath || !this.page) return;

    const cookiesPath = path.resolve(this.config.cookiesPath);
    if (!fs.existsSync(cookiesPath)) {
      console.log('No saved cookies found');
      return;
    }

    try {
      const cookiesJson = fs.readFileSync(cookiesPath, 'utf8');
      const cookies: Cookie[] = JSON.parse(cookiesJson);
      await this.page.setCookie(...cookies);
      console.log(`Loaded ${cookies.length} cookies from ${cookiesPath}`);
    } catch (error) {
      console.warn('Failed to load cookies:', error);
    }
  }

  /**
   * Save cookies to file
   */
  async saveCookies(): Promise<void> {
    if (!this.config.cookiesPath || !this.page) return;

    try {
      const cookies = await this.page.cookies();
      const cookiesPath = path.resolve(this.config.cookiesPath);
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`Saved ${cookies.length} cookies to ${cookiesPath}`);
    } catch (error) {
      console.warn('Failed to save cookies:', error);
    }
  }

  /**
   * Check if logged into Seeking Alpha
   */
  async isLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Navigate to SA and check for login state
      await this.page.goto('https://seekingalpha.com/', {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout,
      });

      // Check for login indicator
      const loggedIn = await this.page.evaluate(() => {
        // Check for user menu or logout button
        const userMenu = document.querySelector('[data-test-id="user-menu"]');
        const logoutLink = document.querySelector('a[href*="logout"]');
        return !!(userMenu || logoutLink);
      });

      return loggedIn;
    } catch {
      return false;
    }
  }

  /**
   * Scrape a transcript page
   */
  async scrapeTranscript(url: string, redirectCount: number = 0): Promise<ScrapeResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];
    let retryCount = 0;

    // Validate URL
    if (!url.includes('seekingalpha.com')) {
      return {
        success: false,
        data: null,
        rawHtml: null,
        rawHtmlHash: null,
        errors: ['URL is not from Seeking Alpha'],
        warnings: [],
        timing: {
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: 0,
        },
        retryCount: 0,
      };
    }

    // Initialize if needed
    if (!this.browser || !this.page) {
      await this.initialize();
    }

    // Check session limit
    if (this.sessionRequestCount >= this.config.maxRequestsPerSession) {
      console.log('Session request limit reached, restarting browser...');
      await this.close();
      await this.initialize();
      this.sessionRequestCount = 0;
    }

    // Wait for rate limit slot
    await this.rateLimiter.waitForSlot();

    // Retry loop
    let rawHtml: string | null = null;
    let lastError: Error | null = null;

    while (retryCount <= this.config.maxRetries) {
      try {
        if (!this.page) throw new Error('Page not initialized');

        console.log(
          `Fetching: ${url} (attempt ${retryCount + 1}/${this.config.maxRetries + 1})`
        );

        // Navigate to page
        await this.page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: this.config.timeout,
        });

        // Wait a bit for dynamic content
        await this.sleep(2000);

        // Get page content
        rawHtml = await this.page.content();

        // Check for paywall
        if (detectPaywall(rawHtml)) {
          throw new Error('Content is behind a paywall. Login may be required.');
        }

        // Check if it's a transcript page
        const pageCheck = isTranscriptPage(rawHtml);
        const transcriptLinks = extractTranscriptLinks(rawHtml);
        if (!pageCheck.isTranscript) {
          if (transcriptLinks.length > 0 && redirectCount < 1) {
            warnings.push(
              `Detected transcript listing page; following first transcript link (${transcriptLinks[0]})`
            );
            return this.scrapeTranscript(transcriptLinks[0], redirectCount + 1);
          }

          warnings.push(
            `Low confidence this is a transcript page (${pageCheck.confidence}%)`
          );
          warnings.push(...pageCheck.reasons);
        }

        // Success - break retry loop
        this.sessionRequestCount++;
        break;
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        if (retryCount <= this.config.maxRetries) {
          console.log(
            `Retry ${retryCount}/${this.config.maxRetries} after error: ${lastError.message}`
          );
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    // If all retries failed
    if (!rawHtml) {
      return {
        success: false,
        data: null,
        rawHtml: null,
        rawHtmlHash: null,
        errors: [lastError?.message || 'Failed to fetch page'],
        warnings,
        timing: {
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(startedAt).getTime(),
        },
        retryCount,
      };
    }

    // Store raw HTML if configured
    const rawHtmlHash = generateRawHtmlHash(rawHtml);
    if (this.config.storeRawHtml && this.config.rawHtmlPath) {
      await this.storeRawHtml(rawHtml, rawHtmlHash);
    }

    // Parse the HTML
    const parseResult = parseTranscriptHtml(rawHtml, url);

    if (!parseResult.success) {
      const transcriptLinks = extractTranscriptLinks(rawHtml);
      if (transcriptLinks.length > 0 && redirectCount < 1) {
        warnings.push(
          `Parsing failed on listing page; retrying first transcript link (${transcriptLinks[0]})`
        );
        return this.scrapeTranscript(transcriptLinks[0], redirectCount + 1);
      }
    }

    if (!parseResult.success) {
      errors.push(...parseResult.errors);
    }
    warnings.push(...parseResult.warnings);

    // Pause before next request
    if (this.config.pauseBetweenRequests > 0) {
      console.log(
        `Waiting ${this.config.pauseBetweenRequests / 1000}s before next request...`
      );
      await this.sleep(this.config.pauseBetweenRequests);
    }

    return {
      success: parseResult.success,
      data: parseResult.data,
      rawHtml,
      rawHtmlHash,
      errors,
      warnings,
      timing: {
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      },
      retryCount,
    };
  }

  /**
   * Store raw HTML to disk
   */
  private async storeRawHtml(html: string, hash: string): Promise<string> {
    const filename = `${hash.substring(0, 16)}-${Date.now()}.html`;
    const filepath = path.join(this.config.rawHtmlPath!, filename);
    fs.writeFileSync(filepath, html, 'utf8');
    return filepath;
  }

  /**
   * Get rate limiter stats
   */
  getStats(): { requestsInLastMinute: number; dailyCount: number; sessionCount: number } {
    const limiterStats = this.rateLimiter.getStats();
    return {
      ...limiterStats,
      sessionCount: this.sessionRequestCount,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.saveCookies();
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Build Seeking Alpha transcript URL from ticker and transcript ID
 */
export function buildTranscriptUrl(ticker: string, transcriptSlug?: string): string {
  const base = `https://seekingalpha.com/symbol/${ticker.toUpperCase()}/earnings/transcripts`;
  if (transcriptSlug) {
    return `https://seekingalpha.com/article/${transcriptSlug}`;
  }
  return base;
}

/**
 * Default scraper instance
 */
export const scraper = new TranscriptScraper();
