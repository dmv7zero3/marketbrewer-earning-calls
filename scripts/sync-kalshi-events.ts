#!/usr/bin/env bun
/**
 * Sync Earnings Events from Kalshi API (Improved Version)
 *
 * Uses the /events endpoint with strike_date for accurate event dates.
 * - strike_date = actual earnings call date (when available)
 * - close_time = when betting closes (stored separately)
 * - Fetches settlement sources for verification
 *
 * Usage: bun run scripts/sync-kalshi-events.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import {
  getAllEarningsEvents,
  saveEarningsEvent,
  type EarningsEvent,
} from '../server/lib/dynamodb';

// Kalshi API configuration
const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID || '';
const KALSHI_PRIVATE_KEY_PATH = process.env.KALSHI_PRIVATE_KEY_PATH || '';

// Company name to stock ticker mapping
const COMPANY_TICKERS: Record<string, string> = {
  Netflix: 'NFLX',
  Intel: 'INTC',
  Tesla: 'TSLA',
  Microsoft: 'MSFT',
  Meta: 'META',
  Apple: 'AAPL',
  Amazon: 'AMZN',
  Google: 'GOOGL',
  Alphabet: 'GOOGL',
  NVIDIA: 'NVDA',
  Palantir: 'PLTR',
  PayPal: 'PYPL',
  Disney: 'DIS',
  Uber: 'UBER',
  Coinbase: 'COIN',
  Robinhood: 'HOOD',
  Airbnb: 'ABNB',
  DraftKings: 'DKNG',
  Roku: 'ROKU',
  Reddit: 'RDDT',
  Snap: 'SNAP',
  GameStop: 'GME',
  AMC: 'AMC',
  Costco: 'COST',
  Target: 'TGT',
  Walmart: 'WMT',
  'Home Depot': 'HD',
  Starbucks: 'SBUX',
  "McDonald's": 'MCD',
  Chipotle: 'CMG',
  Nike: 'NKE',
  Adobe: 'ADBE',
  Salesforce: 'CRM',
  Oracle: 'ORCL',
  Dell: 'DELL',
  Broadcom: 'AVGO',
  CrowdStrike: 'CRWD',
  Lucid: 'LCID',
  NIO: 'NIO',
  Ford: 'F',
  GM: 'GM',
  Delta: 'DAL',
  'United Airlines': 'UAL',
  'American Airlines': 'AAL',
  JPMorgan: 'JPM',
  'Bank of America': 'BAC',
  'Wells Fargo': 'WFC',
  'Goldman Sachs': 'GS',
  BlackRock: 'BLK',
  'American Express': 'AXP',
  'Coca-Cola': 'KO',
  PepsiCo: 'PEP',
  'Procter & Gamble': 'PG',
  'Johnson & Johnson': 'JNJ',
  TSMC: 'TSM',
  Micron: 'MU',
  EA: 'EA',
  Alibaba: 'BABA',
  CAVA: 'CAVA',
  MicroStrategy: 'MSTR',
  'Dollar General': 'DG',
  'GE Vernova': 'GEV',
  'John Deere': 'DE',
  'Berkshire Hathaway': 'BRK.B',
  FedEx: 'FDX',
  Lyft: 'LYFT',
  Albertsons: 'ACI',
  Hims: 'HIMS',
  Celsius: 'CELH',
  CoreWeave: 'CRWV',
  Ulta: 'ULTA',
  Kroger: 'KR',
  'Cracker Barrel': 'CBRL',
  RBC: 'RY',
  'Hewlett Packard': 'HPE',
  Circle: 'CRCL',
  'Constellation Brands': 'STZ',
  Nebius: 'NBIS',
  Chewy: 'CHWY',
};

// Kalshi API Types
interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
}

interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  sub_title: string;
  category: string;
  mutually_exclusive: boolean;
  strike_date: string | null; // The actual event date (e.g., earnings call)
  strike_period: string | null; // e.g., "week", "month"
  markets?: KalshiMarket[];
}

interface KalshiEventMetadata {
  image_url: string;
  settlement_sources: Array<{
    name: string;
    url: string;
  }>;
  market_details?: Array<{
    market_ticker: string;
    image_url: string;
    color_code: string;
  }>;
}

interface KalshiEventsResponse {
  events: KalshiEvent[];
  cursor: string;
}

/**
 * Generate RSA-PSS signature for Kalshi API authentication
 */
function signRequest(method: string, path: string, timestamp: string): string | null {
  try {
    const privateKeyPath = KALSHI_PRIVATE_KEY_PATH.replace('~', process.env.HOME || '');

    if (!fs.existsSync(privateKeyPath)) {
      console.error(`Private key not found at: ${privateKeyPath}`);
      return null;
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const message = `${timestamp}${method}${path}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    const signature = sign.sign(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      'base64'
    );

    return signature;
  } catch (error) {
    console.error('Error signing request:', error);
    return null;
  }
}

/**
 * Make authenticated request to Kalshi API
 */
async function kalshiRequest<T>(endpoint: string): Promise<T | null> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `/trade-api/v2${endpoint}`;
  const signature = signRequest('GET', path, timestamp);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (KALSHI_API_KEY_ID && signature) {
    headers['KALSHI-ACCESS-KEY'] = KALSHI_API_KEY_ID;
    headers['KALSHI-ACCESS-SIGNATURE'] = signature;
    headers['KALSHI-ACCESS-TIMESTAMP'] = timestamp;
  }

  try {
    const response = await fetch(`${KALSHI_API_BASE}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`Kalshi API error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`Response: ${text}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Kalshi API error:', error);
    return null;
  }
}

/**
 * Fetch all earnings events from Kalshi using /events endpoint
 * Uses pagination with cursor
 */
async function fetchKalshiEarningsEvents(): Promise<KalshiEvent[]> {
  const allEvents: KalshiEvent[] = [];
  let cursor: string | undefined;
  let page = 0;

  console.log('Fetching events from Kalshi /events endpoint...\n');

  do {
    page++;
    // Build query params - fetch open events with nested markets
    const params = new URLSearchParams({
      limit: '200',
      with_nested_markets: 'true',
      status: 'open', // Only fetch open events (bettable)
    });

    if (cursor) {
      params.set('cursor', cursor);
    }

    const endpoint = `/events?${params.toString()}`;
    const response = await kalshiRequest<KalshiEventsResponse>(endpoint);

    if (!response) {
      console.error('Failed to fetch events from Kalshi');
      break;
    }

    // Filter for earnings-related events
    const earningsEvents = response.events.filter((event) => {
      const titleLower = event.title.toLowerCase();
      const tickerLower = event.event_ticker.toLowerCase();
      return (
        titleLower.includes('earnings') ||
        titleLower.includes('earnings call') ||
        tickerLower.includes('mention') ||
        tickerLower.includes('earnings')
      );
    });

    allEvents.push(...earningsEvents);
    cursor = response.cursor || undefined;

    console.log(
      `  Page ${page}: ${response.events.length} events, ${earningsEvents.length} earnings-related`
    );

    // Small delay to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (cursor);

  console.log(`\nTotal earnings events found: ${allEvents.length}\n`);
  return allEvents;
}

/**
 * Fetch event metadata (settlement sources) for an event
 */
async function fetchEventMetadata(eventTicker: string): Promise<KalshiEventMetadata | null> {
  const endpoint = `/events/${eventTicker}/metadata`;
  return kalshiRequest<KalshiEventMetadata>(endpoint);
}

/**
 * Extract company name from event title
 */
function extractCompanyName(title: string): string {
  // Pattern: "What will [Company] say..."
  const match = title.match(/What will ([A-Za-z\s&']+) say/i);
  if (match) {
    return match[1].trim();
  }
  // Fallback: try to extract from title
  const words = title.split(' ');
  if (words.length > 2) {
    return words.slice(0, 2).join(' ');
  }
  return title;
}

/**
 * Extract expected earnings date from event ticker
 *
 * Note: Kalshi ticker dates have different meanings:
 * - Old format: KXEARNINGSMENTIONEA-25OCT28 → October 28, 2025 (actual expected earnings date)
 * - New format: KXEARNINGSMENTIONTSLA-26JUN30 → June 30, 2026 (expiration deadline, NOT earnings date)
 *
 * For new Q2+ 2026 tickers, this is the expiration deadline, not the actual earnings date.
 * We should NOT use these as eventDate since they're misleading.
 *
 * Returns null for dates that appear to be expiration deadlines (Jun 30, Dec 31, etc.)
 */
function extractDateFromTicker(ticker: string): string | null {
  // Pattern: -YYMMMDD at the end (e.g., -25OCT28, -26JUN30)
  const match = ticker.match(/-(\d{2})([A-Z]{3})(\d{2})$/i);
  if (!match) return null;

  const [, yearStr, monthStr, dayStr] = match;
  const year = 2000 + parseInt(yearStr, 10);
  const day = parseInt(dayStr, 10);

  const monthMap: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };

  const month = monthMap[monthStr.toUpperCase()];
  if (month === undefined) return null;

  // Skip dates that are clearly expiration deadlines (end of quarter dates)
  // These are NOT actual earnings call dates
  const isExpirationDeadline = (
    (month === 5 && day === 30) ||  // Jun 30
    (month === 2 && day === 31) ||  // Mar 31
    (month === 8 && day === 30) ||  // Sep 30
    (month === 11 && day === 31)    // Dec 31
  );

  if (isExpirationDeadline) {
    return null; // Don't use expiration deadlines as earnings dates
  }

  const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return date.toISOString();
}

/**
 * Get earliest close_time from markets (when betting closes)
 */
function getEarliestCloseTime(markets: KalshiMarket[]): string | null {
  if (!markets || markets.length === 0) return null;

  let earliest = markets[0].close_time;
  for (const market of markets) {
    if (market.close_time < earliest) {
      earliest = market.close_time;
    }
  }
  return earliest;
}

/**
 * Map Kalshi market status to our status
 */
function mapMarketStatus(kalshiStatus: string): string {
  // Kalshi statuses: initialized, inactive, active, closed, determined, disputed, amended, finalized
  // Our statuses: active, open, closed, finalized
  const statusMap: Record<string, string> = {
    initialized: 'inactive',
    inactive: 'inactive',
    active: 'active',
    closed: 'closed',
    determined: 'finalized',
    disputed: 'disputed',
    amended: 'finalized',
    finalized: 'finalized',
  };
  return statusMap[kalshiStatus] || kalshiStatus;
}

/**
 * Match Kalshi events to DB events by company name or event ticker
 */
function matchEvents(
  kalshiEvents: KalshiEvent[],
  dbEvents: EarningsEvent[]
): Array<{
  dbEvent: EarningsEvent;
  kalshiEvent: KalshiEvent;
}> {
  const matches: Array<{
    dbEvent: EarningsEvent;
    kalshiEvent: KalshiEvent;
  }> = [];

  for (const dbEvent of dbEvents) {
    // Try to match by event ticker first
    let kalshiEvent = kalshiEvents.find((ke) => ke.event_ticker === dbEvent.eventTicker);

    // If no match, try to match by company name
    if (!kalshiEvent) {
      const dbCompanyLower = dbEvent.company.toLowerCase();
      kalshiEvent = kalshiEvents.find((ke) => {
        const kalshiCompany = extractCompanyName(ke.title).toLowerCase();
        return (
          dbCompanyLower === kalshiCompany ||
          dbCompanyLower.includes(kalshiCompany) ||
          kalshiCompany.includes(dbCompanyLower)
        );
      });
    }

    if (kalshiEvent) {
      matches.push({ dbEvent, kalshiEvent });
    }
  }

  return matches;
}

/**
 * Main sync function
 */
async function syncKalshiEvents() {
  console.log('=== Kalshi Events Sync (Improved) ===\n');

  // Check for API credentials
  if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY_PATH) {
    console.log('ERROR: Kalshi API credentials not configured.');
    console.log('  Set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PATH in .env\n');
    process.exit(1);
  }

  // Fetch Kalshi events using /events endpoint
  const kalshiEvents = await fetchKalshiEarningsEvents();

  if (kalshiEvents.length === 0) {
    console.log('No earnings events found on Kalshi.');
    console.log('This could mean all markets are settled or no earnings events are currently active.\n');
  }

  // Log Kalshi events for reference
  if (kalshiEvents.length > 0) {
    console.log('Kalshi Events:');
    for (const event of kalshiEvents) {
      const company = extractCompanyName(event.title);
      const tickerDate = extractDateFromTicker(event.event_ticker);
      console.log(`  ${company} (${event.event_ticker})`);
      console.log(`    strike_date: ${event.strike_date || 'NOT SET'}`);
      if (tickerDate) {
        console.log(`    ticker_date: ${tickerDate.split('T')[0]} (extracted from ticker)`);
      }
      console.log(`    strike_period: ${event.strike_period || 'N/A'}`);
      if (event.markets && event.markets.length > 0) {
        const closeTime = getEarliestCloseTime(event.markets);
        console.log(`    close_time: ${closeTime}`);
        console.log(`    markets: ${event.markets.length}`);
        console.log(`    market_statuses: ${[...new Set(event.markets.map((m) => m.status))].join(', ')}`);
      }
    }
    console.log('');
  }

  // Fetch DynamoDB events
  console.log('Fetching events from DynamoDB...\n');
  const dbEvents = await getAllEarningsEvents();
  console.log(`DynamoDB events found: ${dbEvents.length}\n`);

  // Match events
  const matches = matchEvents(kalshiEvents, dbEvents);
  console.log(`Matched events: ${matches.length}\n`);

  // Update matched events with Kalshi data
  let updated = 0;
  let unchanged = 0;
  let metadataFetched = 0;

  for (const { dbEvent, kalshiEvent } of matches) {
    const company = extractCompanyName(kalshiEvent.title);
    const closeTime = kalshiEvent.markets ? getEarliestCloseTime(kalshiEvent.markets) : null;

    // Determine eventDate:
    // 1. Use strike_date if available (most accurate)
    // 2. Try to extract from event ticker (e.g., KXEARNINGSMENTIONEA-25OCT28 → Oct 28, 2025)
    // 3. Otherwise, leave eventDate empty
    let eventDate: string | undefined = undefined;
    let eventDateSource: 'kalshi' | undefined = undefined;
    let eventDateVerified = false;
    let eventDateConfidence: number | undefined = undefined;

    if (kalshiEvent.strike_date) {
      eventDate = kalshiEvent.strike_date;
      eventDateSource = 'kalshi';
      eventDateVerified = true;
      eventDateConfidence = 100;
    } else {
      // Try to extract date from ticker (e.g., -25OCT28 → October 28, 2025)
      const tickerDate = extractDateFromTicker(kalshiEvent.event_ticker);
      if (tickerDate) {
        eventDate = tickerDate;
        eventDateSource = 'kalshi';
        eventDateVerified = true;
        eventDateConfidence = 90; // Slightly lower confidence than strike_date
      } else if (kalshiEvent.strike_period) {
        // strike_period exists but no exact date - lower confidence
        eventDateConfidence = 50;
      }
    }

    // Check if update is needed
    const dbCloseTime = dbEvent.closeTime ? new Date(dbEvent.closeTime) : null;
    const kalshiCloseTime = closeTime ? new Date(closeTime) : null;

    const needsCloseTimeUpdate =
      closeTime && (!dbCloseTime || kalshiCloseTime?.getTime() !== dbCloseTime?.getTime());
    const needsEventDateUpdate =
      eventDate && (!dbEvent.eventDate || dbEvent.eventDate !== eventDate);
    const needsMarketsUpdate =
      kalshiEvent.markets && kalshiEvent.markets.length > 0;

    if (needsCloseTimeUpdate || needsEventDateUpdate || needsMarketsUpdate) {
      console.log(`Updating ${company}:`);

      if (eventDate) {
        const source = kalshiEvent.strike_date ? 'strike_date' : 'ticker';
        console.log(`  eventDate: ${dbEvent.eventDate || 'none'} → ${eventDate} (from ${source})`);
      } else {
        console.log(`  eventDate: NOT AVAILABLE (no strike_date or ticker date)`);
      }

      if (closeTime) {
        console.log(`  closeTime: ${dbEvent.closeTime || 'none'} → ${closeTime}`);
      }

      // Fetch settlement sources metadata
      let settlementSources: Array<{ name: string; url: string }> | undefined;
      const metadata = await fetchEventMetadata(kalshiEvent.event_ticker);
      if (metadata && metadata.settlement_sources) {
        settlementSources = metadata.settlement_sources;
        metadataFetched++;
        console.log(`  settlement_sources: ${settlementSources.map((s) => s.name).join(', ')}`);
      }

      // Map markets
      // Note: Kalshi API returns prices as integers (0-100), not decimals
      const updatedMarkets = kalshiEvent.markets
        ? kalshiEvent.markets.map((m) => ({
            ticker: m.ticker,
            word: m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '',
            yesPrice: m.yes_bid || m.last_price || 0,
            noPrice: m.no_bid || (100 - (m.last_price || 0)),
            lastPrice: m.last_price || 0,
            volume: m.volume || 0,
            status: mapMarketStatus(m.status),
          }))
        : dbEvent.markets;

      const totalVolume = updatedMarkets.reduce((sum, m) => sum + m.volume, 0);

      // Determine event status based on market statuses
      let eventStatus = dbEvent.status;
      if (kalshiEvent.markets && kalshiEvent.markets.length > 0) {
        const hasActiveMarket = kalshiEvent.markets.some((m) => m.status === 'active');
        const allClosed = kalshiEvent.markets.every(
          (m) => m.status === 'closed' || m.status === 'determined' || m.status === 'finalized'
        );

        if (hasActiveMarket) {
          eventStatus = 'active';
        } else if (allClosed) {
          eventStatus = 'settled';
        }
      }

      console.log(`  status: ${dbEvent.status} → ${eventStatus}`);
      console.log(`  markets: ${updatedMarkets.length}`);

      // Save the updated event
      await saveEarningsEvent({
        eventTicker: kalshiEvent.event_ticker, // Use Kalshi's event ticker
        seriesTicker: kalshiEvent.series_ticker,
        company: dbEvent.company,
        stockTicker: dbEvent.stockTicker || COMPANY_TICKERS[dbEvent.company],
        title: kalshiEvent.title,
        category: kalshiEvent.category || dbEvent.category,
        status: eventStatus,
        eventDate: eventDate || dbEvent.eventDate,
        eventDateSource: eventDateSource || dbEvent.eventDateSource,
        eventDateVerified: eventDateVerified || dbEvent.eventDateVerified || false,
        eventDateConfidence: eventDateConfidence ?? dbEvent.eventDateConfidence,
        eventDateUpdatedAt: eventDate ? new Date().toISOString() : dbEvent.eventDateUpdatedAt,
        closeTime: closeTime || dbEvent.closeTime,
        seekingAlphaUrl: dbEvent.seekingAlphaUrl,
        markets: updatedMarkets,
        totalVolume,
        marketCount: updatedMarkets.length,
      });

      updated++;
      console.log('');
    } else {
      unchanged++;
    }

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Report unmatched DB events
  const unmatchedDb = dbEvents.filter(
    (db) => !matches.some((m) => m.dbEvent.eventTicker === db.eventTicker)
  );

  if (unmatchedDb.length > 0) {
    console.log(`\nEvents without Kalshi match (${unmatchedDb.length}):`);
    for (const event of unmatchedDb.slice(0, 10)) {
      console.log(`  - ${event.company} (${event.eventTicker})`);
      console.log(`    status: ${event.status}`);
      if (event.eventDate) {
        console.log(`    eventDate: ${event.eventDate}`);
      }
    }
    if (unmatchedDb.length > 10) {
      console.log(`  ... and ${unmatchedDb.length - 10} more`);
    }
  }

  // Report unmatched Kalshi events (new events not in DB)
  const unmatchedKalshi = kalshiEvents.filter(
    (ke) => !matches.some((m) => m.kalshiEvent.event_ticker === ke.event_ticker)
  );

  if (unmatchedKalshi.length > 0) {
    console.log(`\nNew Kalshi events not in DB (${unmatchedKalshi.length}):`);
    for (const event of unmatchedKalshi) {
      const company = extractCompanyName(event.title);
      console.log(`  - ${company} (${event.event_ticker})`);
      console.log(`    strike_date: ${event.strike_date || 'NOT SET'}`);
    }
  }

  console.log('\n=== Sync Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Metadata fetched: ${metadataFetched}`);
  console.log(`Unmatched DB events: ${unmatchedDb.length}`);
  console.log(`New Kalshi events: ${unmatchedKalshi.length}`);
  console.log(`Total DB events: ${dbEvents.length}`);
}

// Run the sync
syncKalshiEvents()
  .then(() => {
    console.log('\nSync complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
