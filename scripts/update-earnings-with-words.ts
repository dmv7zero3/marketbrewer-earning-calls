#!/usr/bin/env bun
/**
 * Update Earnings Events Metadata
 * Adds Seeking Alpha URLs and stock tickers without generating placeholder data
 *
 * Usage: bun run scripts/update-earnings-with-words.ts
 */

import 'dotenv/config';
import {
  getAllEarningsEvents,
  updateEarningsEventMarkets,
  saveEarningsEvent,
  type EarningsEvent,
} from '../server/lib/dynamodb';

// Company name to stock ticker mapping for Seeking Alpha URLs
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

// Generate Seeking Alpha transcript URL for a company
function getSeekingAlphaUrl(company: string): string | undefined {
  const ticker = COMPANY_TICKERS[company];
  if (ticker) {
    return `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`;
  }
  return undefined;
}

async function updateEventsWithWords() {
  console.log('Fetching all earnings events...\n');

  const events = await getAllEarningsEvents();
  console.log(`Found ${events.length} events\n`);

  let updated = 0;
  let errors = 0;

  for (const event of events) {
    try {
      // Get Seeking Alpha URL and stock ticker
      const seekingAlphaUrl = getSeekingAlphaUrl(event.company);
      const stockTicker = COMPANY_TICKERS[event.company];

      // Update metadata only (no placeholder markets or dates)
      await saveEarningsEvent({
        eventTicker: event.eventTicker,
        company: event.company,
        stockTicker,
        title: event.title,
        category: event.category,
        status: event.status,
        eventDate: event.eventDate,
        closeTime: event.closeTime,
        seekingAlphaUrl,
        markets: event.markets,
        totalVolume: event.totalVolume,
        marketCount: event.marketCount,
      });

      console.log(`✓ Updated: ${event.company} - metadata only`);
      updated++;
    } catch (error) {
      console.error(`✗ Error updating ${event.company}:`, error);
      errors++;
    }
  }

  console.log('\n--- Update Summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${events.length}`);
}

// Run the update
updateEventsWithWords()
  .then(() => {
    console.log('\nUpdate complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Update failed:', error);
    process.exit(1);
  });
