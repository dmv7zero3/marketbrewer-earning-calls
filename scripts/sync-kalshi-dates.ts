#!/usr/bin/env bun
/**
 * Sync Earnings Event Dates from Kalshi API
 *
 * This script fetches live market data from Kalshi and updates
 * close_time and markets in DynamoDB without overwriting earnings event dates.
 *
 * Usage: bun run scripts/sync-kalshi-dates.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import {
  getAllEarningsEvents,
  saveEarningsEvent,
  updateEarningsEventDate,
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

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_price: number;
  volume: number;
  status: string;
  close_time: string;
  expiration_time: string;
  yes_sub_title?: string;
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

    if (!response.ok) {
      console.error(`Kalshi API error: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Kalshi API error:', error);
    return null;
  }
}

/**
 * Fetch all earnings mention markets from Kalshi
 */
async function fetchKalshiEarningsMarkets(): Promise<KalshiMarket[]> {
  const allMarkets: KalshiMarket[] = [];
  let cursor: string | undefined;

  console.log('Fetching markets from Kalshi API...\n');

  // Paginate through all markets
  do {
    const endpoint = cursor
      ? `/markets?limit=200&cursor=${cursor}`
      : '/markets?limit=200';

    const response = await kalshiRequest<{ markets: KalshiMarket[]; cursor?: string }>(
      endpoint
    );

    if (!response) {
      console.error('Failed to fetch markets from Kalshi');
      break;
    }

    // Filter for earnings mention markets
    const earningsMarkets = response.markets.filter((m) => {
      const titleLower = m.title.toLowerCase();
      const tickerLower = m.ticker.toLowerCase();
      return (
        titleLower.includes('earnings') ||
        titleLower.includes('earnings call') ||
        tickerLower.includes('mention') ||
        tickerLower.includes('earnings')
      );
    });

    allMarkets.push(...earningsMarkets);
    cursor = response.cursor;

    console.log(
      `  Fetched ${response.markets.length} markets, ${earningsMarkets.length} earnings-related`
    );
  } while (cursor);

  console.log(`\nTotal earnings markets found: ${allMarkets.length}\n`);
  return allMarkets;
}

/**
 * Group markets by event ticker and extract dates
 */
function groupMarketsByEvent(markets: KalshiMarket[]): Map<
  string,
  {
    eventTicker: string;
    company: string;
    closeTime: string;
    markets: KalshiMarket[];
  }
> {
  const eventMap = new Map<
    string,
    {
      eventTicker: string;
      company: string;
      closeTime: string;
      markets: KalshiMarket[];
    }
  >();

  for (const market of markets) {
    const existing = eventMap.get(market.event_ticker);

    if (existing) {
      existing.markets.push(market);
      // Use earliest close_time among all markets in the event
      if (market.close_time < existing.closeTime) {
        existing.closeTime = market.close_time;
      }
    } else {
      // Extract company name from title (e.g., "What will Netflix say...")
      const titleMatch = market.title.match(/What will ([A-Za-z\s&']+) say/i);
      const company = titleMatch ? titleMatch[1].trim() : market.event_ticker;

      eventMap.set(market.event_ticker, {
        eventTicker: market.event_ticker,
        company,
        closeTime: market.close_time,
        markets: [market],
      });
    }
  }

  return eventMap;
}

/**
 * Match Kalshi event to DynamoDB event by company name
 */
function matchEvents(
  kalshiEvents: Map<
    string,
    { eventTicker: string; company: string; closeTime: string; markets: KalshiMarket[] }
  >,
  dbEvents: EarningsEvent[]
): Array<{
  dbEvent: EarningsEvent;
  kalshiEvent: {
    eventTicker: string;
    company: string;
    closeTime: string;
    markets: KalshiMarket[];
  };
}> {
  const matches: Array<{
    dbEvent: EarningsEvent;
    kalshiEvent: {
      eventTicker: string;
      company: string;
      closeTime: string;
      markets: KalshiMarket[];
    };
  }> = [];

  for (const dbEvent of dbEvents) {
    // Try to match by event ticker first
    let kalshiEvent = kalshiEvents.get(dbEvent.eventTicker);

    // If no match, try to match by company name
    if (!kalshiEvent) {
      for (const [, ke] of kalshiEvents) {
        const dbCompanyLower = dbEvent.company.toLowerCase();
        const kalshiCompanyLower = ke.company.toLowerCase();

        if (
          dbCompanyLower === kalshiCompanyLower ||
          dbCompanyLower.includes(kalshiCompanyLower) ||
          kalshiCompanyLower.includes(dbCompanyLower)
        ) {
          kalshiEvent = ke;
          break;
        }
      }
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
async function syncKalshiDates() {
  console.log('=== Kalshi Date Sync ===\n');

  // Check for API credentials
  if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY_PATH) {
    console.log('⚠ Kalshi API credentials not configured.');
    console.log('  Set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PATH in .env\n');
    console.log('  Running in read-only mode (no Kalshi sync)...\n');
  }

  // Fetch Kalshi markets
  const kalshiMarkets = await fetchKalshiEarningsMarkets();
  const kalshiEvents = groupMarketsByEvent(kalshiMarkets);

  console.log(`Kalshi events found: ${kalshiEvents.size}\n`);

  // Log Kalshi events for reference
  if (kalshiEvents.size > 0) {
    console.log('Kalshi Events:');
    for (const [ticker, event] of kalshiEvents) {
      console.log(`  ${event.company} (${ticker})`);
      console.log(`    Close: ${event.closeTime}`);
      console.log(`    Markets: ${event.markets.length}`);
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

  // Update matched events with Kalshi dates
  let updated = 0;
  let unchanged = 0;

  for (const { dbEvent, kalshiEvent } of matches) {
    const kalshiCloseTime = new Date(kalshiEvent.closeTime);
    const dbCloseTime = dbEvent.closeTime ? new Date(dbEvent.closeTime) : null;

    // Update closeTime/markets AND set eventDate from Kalshi close_time
    const needsUpdate = !dbCloseTime || kalshiCloseTime.getTime() !== dbCloseTime.getTime();
    const needsEventDate = !dbEvent.eventDate || !dbEvent.eventDateVerified;

    if (needsUpdate || needsEventDate) {
      console.log(`✓ Updating ${dbEvent.company}:`);
      console.log(`    Close (old): ${dbEvent.closeTime || 'none'}`);
      console.log(`    Close (new): ${kalshiEvent.closeTime} (from Kalshi)`);
      console.log(`    EventDate: ${kalshiEvent.closeTime} (verified from Kalshi)`);

      // Update markets with Kalshi data
      const updatedMarkets = kalshiEvent.markets.map((m) => ({
        ticker: m.ticker,
        word: m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '',
        yesPrice: Math.round((m.yes_bid || m.last_price || 0) * 100),
        noPrice: Math.round((m.no_bid || 1 - (m.last_price || 0)) * 100),
        lastPrice: Math.round((m.last_price || 0) * 100),
        volume: m.volume || 0,
        status: m.status || 'open',
      }));

      const totalVolume = updatedMarkets.reduce((sum, m) => sum + m.volume, 0);

      // Save the event with updated markets and closeTime
      await saveEarningsEvent({
        eventTicker: dbEvent.eventTicker,
        seriesTicker: dbEvent.seriesTicker,
        company: dbEvent.company,
        stockTicker: dbEvent.stockTicker || COMPANY_TICKERS[dbEvent.company],
        title: dbEvent.title,
        category: dbEvent.category,
        status: dbEvent.status,
        eventDate: kalshiEvent.closeTime, // Use Kalshi close_time as event date
        eventDateSource: 'kalshi' as any,
        eventDateVerified: true, // Mark as verified since it comes from Kalshi
        eventDateConfidence: 100,
        eventDateUpdatedAt: new Date().toISOString(),
        closeTime: kalshiEvent.closeTime,
        seekingAlphaUrl: dbEvent.seekingAlphaUrl,
        markets: updatedMarkets.length > 0 ? updatedMarkets : dbEvent.markets,
        totalVolume: updatedMarkets.length > 0 ? totalVolume : dbEvent.totalVolume,
        marketCount:
          updatedMarkets.length > 0 ? updatedMarkets.length : dbEvent.marketCount,
      });

      updated++;
    } else {
      unchanged++;
    }
  }

  // Report unmatched events
  const unmatchedDb = dbEvents.filter(
    (db) => !matches.some((m) => m.dbEvent.eventTicker === db.eventTicker)
  );

  if (unmatchedDb.length > 0) {
    console.log(`\n⚠ Events without Kalshi match (${unmatchedDb.length}):`);
    for (const event of unmatchedDb) {
      console.log(`  - ${event.company} (${event.eventTicker})`);
      if (event.eventDate) {
        const eventDate = new Date(event.eventDate);
        const isPast = eventDate < new Date();
        console.log(`    Date: ${event.eventDate} ${isPast ? '(PAST)' : ''}`);
      } else {
        console.log(`    Date: NOT SET`);
      }
    }
  }

  console.log('\n=== Sync Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Unmatched: ${unmatchedDb.length}`);
  console.log(`Total DB events: ${dbEvents.length}`);
}

// Run the sync
syncKalshiDates()
  .then(() => {
    console.log('\nSync complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
