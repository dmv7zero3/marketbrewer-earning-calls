#!/usr/bin/env bun
/**
 * Fetch Earnings Call Dates from Finnhub API
 *
 * Fetches actual earnings call dates for companies using Finnhub's free API.
 * Updates eventDate in DynamoDB when dates are found.
 *
 * Usage: bun run scripts/fetch-earnings-dates.ts
 *
 * Requires: FINNHUB_API_KEY environment variable
 * Get a free API key at: https://finnhub.io/register
 */

import 'dotenv/config';
import {
  getAllEarningsEvents,
  updateEarningsEventDate,
  type EarningsEvent,
} from '../server/lib/dynamodb';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

// Stock ticker mapping for companies
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
  'Berkshire Hathaway': 'BRK-B',
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

interface YahooEarningsData {
  earningsDate?: string;
  earningsDateStart?: string;
  earningsDateEnd?: string;
  earningsCallTime?: string; // "BMO" (before market open), "AMC" (after market close), "TAS" (time not supplied)
}

/**
 * Fetch earnings date for a ticker from Finnhub API
 */
async function fetchFinnhubEarningsDate(ticker: string): Promise<YahooEarningsData | null> {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  try {
    // Get earnings calendar for the next 3 months
    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const fromDate = today.toISOString().split('T')[0];
    const toDate = threeMonthsLater.toISOString().split('T')[0];

    const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${FINNHUB_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`  Finnhub API error for ${ticker}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Find the next upcoming earnings date
    if (data.earningsCalendar && data.earningsCalendar.length > 0) {
      // Sort by date and get the nearest future date
      const upcoming = data.earningsCalendar
        .filter((e: any) => new Date(e.date) >= today)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (upcoming.length > 0) {
        const nextEarnings = upcoming[0];
        // Parse date (format: YYYY-MM-DD)
        let date = new Date(nextEarnings.date + 'T12:00:00Z');

        // IMPORTANT: Finnhub returns the earnings RELEASE date, not the CALL date
        // For AMC (after market close) releases, the actual earnings CALL is typically
        // the NEXT MORNING. We add 1 day to get the call date.
        // For BMO (before market open), the call is the same day.
        if (nextEarnings.hour === 'amc') {
          date = new Date(date.getTime() + 24 * 60 * 60 * 1000); // Add 1 day
        }

        return {
          earningsDate: date.toISOString(),
          earningsDateStart: date.toISOString().split('T')[0], // Use adjusted date
          earningsCallTime: nextEarnings.hour, // "bmo" (before market open) or "amc" (after market close)
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`  Error fetching ${ticker}:`, error);
    return null;
  }
}

/**
 * Main function
 */
async function fetchEarningsDates() {
  console.log('=== Fetch Earnings Dates from Finnhub ===\n');

  if (!FINNHUB_API_KEY) {
    console.log('ERROR: FINNHUB_API_KEY not set in environment.');
    console.log('Get a free API key at: https://finnhub.io/register');
    console.log('Then add to .env: FINNHUB_API_KEY=your_key_here\n');
    process.exit(1);
  }

  // Get all events
  const events = await getAllEarningsEvents();
  console.log(`Total events: ${events.length}\n`);

  // Filter to events that need dates:
  // - Active status
  // - Either no eventDate, or eventDate looks like an expiration deadline (Jun 30, etc.)
  const isExpirationDate = (dateStr: string | undefined): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    return (
      (month === 5 && day === 30) ||  // Jun 30
      (month === 2 && day === 31) ||  // Mar 31
      (month === 8 && day === 30) ||  // Sep 30
      (month === 11 && day === 31)    // Dec 31
    );
  };

  const needsDates = events.filter((e) => {
    if (e.status !== 'active') return false;
    // No date at all
    if (!e.eventDate) return true;
    // Has an expiration deadline instead of real date
    if (isExpirationDate(e.eventDate)) return true;
    // Not verified
    if (!e.eventDateVerified) return true;
    return false;
  });

  console.log(`Events needing dates: ${needsDates.length}\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const event of needsDates) {
    const ticker = event.stockTicker || COMPANY_TICKERS[event.company];

    if (!ticker) {
      console.log(`⚠ ${event.company}: No ticker found`);
      notFound++;
      continue;
    }

    console.log(`Fetching ${event.company} (${ticker})...`);

    const earningsData = await fetchFinnhubEarningsDate(ticker);

    if (earningsData?.earningsDate) {
      const date = new Date(earningsData.earningsDate);
      const now = new Date();

      // Only update if date is in the future
      if (date > now) {
        console.log(`  ✓ Earnings date: ${earningsData.earningsDateStart || date.toISOString().split('T')[0]}`);
        if (earningsData.earningsCallTime) {
          console.log(`    Time: ${earningsData.earningsCallTime}`);
        }
        if (earningsData.earningsDateEnd && earningsData.earningsDateEnd !== earningsData.earningsDateStart) {
          console.log(`    Range: ${earningsData.earningsDateStart} - ${earningsData.earningsDateEnd}`);
        }

        // Update DynamoDB
        await updateEarningsEventDate(event.company, event.eventTicker, {
          eventDate: earningsData.earningsDate,
          source: 'finnhub' as any, // External source
          verified: true,
          confidence: earningsData.earningsDateEnd === earningsData.earningsDateStart ? 100 : 80,
        });

        updated++;
      } else {
        console.log(`  ⏭ Date ${earningsData.earningsDateStart} is in the past`);
      }
    } else {
      console.log(`  ✗ No earnings date found`);
      notFound++;
    }

    // Rate limit: 500ms between requests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('\n=== Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total processed: ${needsDates.length}`);
}

// Run
fetchEarningsDates()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
