#!/usr/bin/env bun
/**
 * Update Earnings Events with Word Bets
 * Adds sample word bets and estimated event dates for each company
 *
 * Usage: bun run scripts/update-earnings-with-words.ts
 */

import 'dotenv/config';
import {
  getAllEarningsEvents,
  updateEarningsEventMarkets,
  saveEarningsEvent,
  type EarningsEvent
} from '../server/lib/dynamodb';

// Common earnings call words that Kalshi typically offers
const COMMON_WORDS = [
  'AI', 'growth', 'revenue', 'profit', 'margin', 'guidance',
  'demand', 'customers', 'innovation', 'efficiency', 'cloud',
  'partnership', 'expansion', 'investment', 'cost', 'pricing',
  'market', 'competition', 'strategy', 'outlook', 'momentum'
];

// Company-specific word suggestions
const COMPANY_WORDS: Record<string, string[]> = {
  'NVIDIA': ['AI', 'GPU', 'datacenter', 'gaming', 'Blackwell', 'inference', 'training', 'chips'],
  'Apple': ['iPhone', 'services', 'Mac', 'iPad', 'Vision', 'AI', 'China', 'revenue'],
  'Tesla': ['deliveries', 'FSD', 'Cybertruck', 'margins', 'robotaxi', 'energy', 'AI', 'Optimus'],
  'Microsoft': ['Azure', 'AI', 'Copilot', 'cloud', 'Office', 'gaming', 'LinkedIn', 'growth'],
  'Google': ['search', 'AI', 'Gemini', 'cloud', 'YouTube', 'advertising', 'revenue', 'growth'],
  'Amazon': ['AWS', 'AI', 'Prime', 'advertising', 'retail', 'fulfillment', 'margins', 'growth'],
  'Meta': ['AI', 'Reels', 'WhatsApp', 'metaverse', 'advertising', 'engagement', 'Reality', 'growth'],
  'Netflix': ['subscribers', 'advertising', 'password', 'content', 'gaming', 'engagement', 'revenue'],
  'Coinbase': ['trading', 'Bitcoin', 'crypto', 'revenue', 'ETF', 'custody', 'staking', 'users'],
  'Palantir': ['AI', 'AIP', 'government', 'commercial', 'revenue', 'growth', 'contracts', 'customers'],
  'GameStop': ['revenue', 'stores', 'digital', 'collectibles', 'transformation', 'profitability'],
  'AMC': ['attendance', 'revenue', 'debt', 'streaming', 'theaters', 'moviegoing', 'blockbusters'],
};

// Company name to stock ticker mapping for Seeking Alpha URLs
const COMPANY_TICKERS: Record<string, string> = {
  'Netflix': 'NFLX',
  'Intel': 'INTC',
  'Tesla': 'TSLA',
  'Microsoft': 'MSFT',
  'Meta': 'META',
  'Apple': 'AAPL',
  'Amazon': 'AMZN',
  'Google': 'GOOGL',
  'Alphabet': 'GOOGL',
  'NVIDIA': 'NVDA',
  'Palantir': 'PLTR',
  'PayPal': 'PYPL',
  'Disney': 'DIS',
  'Uber': 'UBER',
  'Coinbase': 'COIN',
  'Robinhood': 'HOOD',
  'Airbnb': 'ABNB',
  'DraftKings': 'DKNG',
  'Roku': 'ROKU',
  'Reddit': 'RDDT',
  'Snap': 'SNAP',
  'GameStop': 'GME',
  'AMC': 'AMC',
  'Costco': 'COST',
  'Target': 'TGT',
  'Walmart': 'WMT',
  'Home Depot': 'HD',
  'Starbucks': 'SBUX',
  'McDonald\'s': 'MCD',
  'Chipotle': 'CMG',
  'Nike': 'NKE',
  'Adobe': 'ADBE',
  'Salesforce': 'CRM',
  'Oracle': 'ORCL',
  'Dell': 'DELL',
  'Broadcom': 'AVGO',
  'CrowdStrike': 'CRWD',
  'Lucid': 'LCID',
  'NIO': 'NIO',
  'Ford': 'F',
  'GM': 'GM',
  'Delta': 'DAL',
  'United Airlines': 'UAL',
  'American Airlines': 'AAL',
  'JPMorgan': 'JPM',
  'Bank of America': 'BAC',
  'Wells Fargo': 'WFC',
  'Goldman Sachs': 'GS',
  'BlackRock': 'BLK',
  'American Express': 'AXP',
  'Coca-Cola': 'KO',
  'PepsiCo': 'PEP',
  'Procter & Gamble': 'PG',
  'Johnson & Johnson': 'JNJ',
  'TSMC': 'TSM',
  'Micron': 'MU',
  'EA': 'EA',
  'Alibaba': 'BABA',
  'CAVA': 'CAVA',
  'MicroStrategy': 'MSTR',
  'Dollar General': 'DG',
  'GE Vernova': 'GEV',
  'John Deere': 'DE',
  'Berkshire Hathaway': 'BRK.B',
  'FedEx': 'FDX',
  'Lyft': 'LYFT',
  'Albertsons': 'ACI',
  'Hims': 'HIMS',
  'Celsius': 'CELH',
  'CoreWeave': 'CRWV',
  'Ulta': 'ULTA',
  'Kroger': 'KR',
  'Cracker Barrel': 'CBRL',
  'RBC': 'RY',
  'Hewlett Packard': 'HPE',
  'Circle': 'CRCL',
  'Constellation Brands': 'STZ',
  'Nebius': 'NBIS',
  'Chewy': 'CHWY',
};

// Generate Seeking Alpha transcript URL for a company
function getSeekingAlphaUrl(company: string): string | undefined {
  const ticker = COMPANY_TICKERS[company];
  if (ticker) {
    return `https://seekingalpha.com/symbol/${ticker}/earnings/transcripts`;
  }
  return undefined;
}

// Estimated Q1 2026 earnings dates (approximate)
const ESTIMATED_DATES: Record<string, string> = {
  'Netflix': '2026-01-21T21:00:00Z',
  'Intel': '2026-01-23T21:00:00Z',
  'Tesla': '2026-01-29T21:00:00Z',
  'Microsoft': '2026-01-29T21:00:00Z',
  'Meta': '2026-01-29T21:00:00Z',
  'Apple': '2026-01-30T21:00:00Z',
  'Amazon': '2026-01-30T21:00:00Z',
  'Google': '2026-01-30T21:00:00Z',
  'Alphabet': '2026-01-30T21:00:00Z',
  'NVIDIA': '2026-02-26T21:00:00Z',
  'Palantir': '2026-02-03T21:00:00Z',
  'PayPal': '2026-02-04T21:00:00Z',
  'Disney': '2026-02-05T21:00:00Z',
  'Uber': '2026-02-05T21:00:00Z',
  'Coinbase': '2026-02-13T21:00:00Z',
  'Robinhood': '2026-02-12T21:00:00Z',
  'Airbnb': '2026-02-13T21:00:00Z',
  'DraftKings': '2026-02-14T21:00:00Z',
  'Roku': '2026-02-13T21:00:00Z',
  'Reddit': '2026-02-12T21:00:00Z',
  'Snap': '2026-02-04T21:00:00Z',
  'GameStop': '2026-03-25T21:00:00Z',
  'AMC': '2026-02-27T21:00:00Z',
  'Costco': '2026-03-06T21:00:00Z',
  'Target': '2026-03-05T21:00:00Z',
  'Walmart': '2026-02-20T21:00:00Z',
  'Home Depot': '2026-02-25T21:00:00Z',
  'Starbucks': '2026-01-28T21:00:00Z',
  'McDonald\'s': '2026-02-10T21:00:00Z',
  'Chipotle': '2026-02-04T21:00:00Z',
  'Nike': '2026-03-20T21:00:00Z',
  'Adobe': '2026-03-13T21:00:00Z',
  'Salesforce': '2026-02-26T21:00:00Z',
  'Oracle': '2026-03-10T21:00:00Z',
  'Dell': '2026-02-27T21:00:00Z',
  'Broadcom': '2026-03-06T21:00:00Z',
  'CrowdStrike': '2026-03-04T21:00:00Z',
  'Lucid': '2026-02-25T21:00:00Z',
  'NIO': '2026-03-04T21:00:00Z',
  'Ford': '2026-02-05T21:00:00Z',
  'GM': '2026-01-28T21:00:00Z',
  'Delta': '2026-01-20T14:00:00Z',
  'United Airlines': '2026-01-21T21:00:00Z',
  'American Airlines': '2026-01-23T21:00:00Z',
  'JPMorgan': '2026-01-20T12:00:00Z',
  'Bank of America': '2026-01-21T12:00:00Z',
  'Wells Fargo': '2026-04-15T12:00:00Z', // Q1 2026 earnings (Q4 2025 was Jan 14)
  'Goldman Sachs': '2026-01-20T12:00:00Z',
  'BlackRock': '2026-01-20T12:00:00Z',
  'American Express': '2026-01-24T12:00:00Z',
  'Coca-Cola': '2026-02-11T12:00:00Z',
  'PepsiCo': '2026-02-04T12:00:00Z',
  'Procter & Gamble': '2026-01-22T12:00:00Z',
  'Johnson & Johnson': '2026-01-22T12:00:00Z',
  'TSMC': '2026-01-21T06:00:00Z',
  'Micron': '2026-03-20T21:00:00Z',
  'EA': '2026-02-04T21:00:00Z',
  'Alibaba': '2026-02-20T06:00:00Z',
  // Additional companies
  'CAVA': '2026-02-25T21:00:00Z',
  'MicroStrategy': '2026-02-04T21:00:00Z',
  'Dollar General': '2026-03-12T12:00:00Z',
  'GE Vernova': '2026-01-22T12:00:00Z',
  'John Deere': '2026-02-21T12:00:00Z',
  'Berkshire Hathaway': '2026-02-22T12:00:00Z',
  'FedEx': '2026-03-19T21:00:00Z',
  'Lyft': '2026-02-11T21:00:00Z',
  'Albertsons': '2026-02-25T12:00:00Z',
  'Hims': '2026-02-24T21:00:00Z',
  'Celsius': '2026-02-13T21:00:00Z',
  'CoreWeave': '2026-02-27T21:00:00Z',
  'Ulta': '2026-03-06T21:00:00Z',
  'Kroger': '2026-03-05T12:00:00Z',
  'Cracker Barrel': '2026-02-24T12:00:00Z',
  'RBC': '2026-02-26T12:00:00Z',
  'Hewlett Packard': '2026-03-03T21:00:00Z',
  'Circle': '2026-02-20T21:00:00Z',
  'Constellation Brands': '2026-04-10T12:00:00Z', // Q4 FY2026 earnings (Q3 was Jan 9)
  'Nebius': '2026-02-20T21:00:00Z',
  'Chewy': '2026-03-26T21:00:00Z',
};

// Generate random price between min and max (in cents)
function randomPrice(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get words for a company
function getWordsForCompany(company: string): string[] {
  const specificWords = COMPANY_WORDS[company] || [];
  const commonSample = COMMON_WORDS
    .sort(() => Math.random() - 0.5)
    .slice(0, 8 - specificWords.length);

  return [...specificWords.slice(0, 4), ...commonSample].slice(0, 8);
}

// Generate word markets for a company
function generateWordMarkets(company: string, eventTicker: string): EarningsEvent['markets'] {
  const words = getWordsForCompany(company);

  return words.map((word, index) => {
    const yesPrice = randomPrice(15, 85); // 15% to 85% implied probability
    return {
      ticker: `${eventTicker}-${word.toUpperCase()}-W${index + 1}`,
      word,
      yesPrice,
      noPrice: 100 - yesPrice,
      lastPrice: yesPrice,
      volume: randomPrice(100, 50000),
      status: 'open',
    };
  });
}

async function updateEventsWithWords() {
  console.log('Fetching all earnings events...\n');

  const events = await getAllEarningsEvents();
  console.log(`Found ${events.length} events\n`);

  let updated = 0;
  let errors = 0;

  for (const event of events) {
    try {
      // Generate word markets
      const markets = generateWordMarkets(event.company, event.eventTicker);
      const totalVolume = markets.reduce((sum, m) => sum + m.volume, 0);

      // Get estimated date if available
      const eventDate = ESTIMATED_DATES[event.company] ||
        // Default to random date in Q1 2026 (future dates)
        new Date(2026, Math.floor(Math.random() * 3) + 1, Math.floor(Math.random() * 28) + 1).toISOString();

      // Get Seeking Alpha URL and stock ticker
      const seekingAlphaUrl = getSeekingAlphaUrl(event.company);
      const stockTicker = COMPANY_TICKERS[event.company];

      // Update the event with markets, date, and Seeking Alpha URL
      await saveEarningsEvent({
        eventTicker: event.eventTicker,
        company: event.company,
        stockTicker,
        title: event.title,
        category: event.category,
        status: new Date(eventDate) < new Date() ? 'closed' : 'active',
        eventDate,
        closeTime: eventDate,
        seekingAlphaUrl,
        markets,
        totalVolume,
        marketCount: markets.length,
      });

      console.log(`✓ Updated: ${event.company} - ${markets.length} words, $${totalVolume.toLocaleString()} vol`);
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
