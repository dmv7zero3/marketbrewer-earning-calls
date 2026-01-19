#!/usr/bin/env bun
/**
 * Sync Market Statuses from Kalshi API
 *
 * Checks each market ticker against Kalshi and updates the status.
 * Markets not found on Kalshi are marked as 'finalized' (settled/removed).
 *
 * Usage: bun run scripts/sync-market-statuses.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { getAllEarningsEvents, saveEarningsEvent } from '../server/lib/dynamodb';

// Kalshi API configuration
const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID || '';
const KALSHI_PRIVATE_KEY_PATH = process.env.KALSHI_PRIVATE_KEY_PATH || '';

interface KalshiMarket {
  ticker: string;
  status: string;
  close_time: string;
  result?: string;
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
      return null; // Market not found
    }

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
 * Get market status from Kalshi
 */
async function getMarketStatus(ticker: string): Promise<string> {
  const result = await kalshiRequest<{ market: KalshiMarket }>(`/markets/${ticker}`);

  if (!result || !result.market) {
    // Market not found = already settled/removed
    return 'finalized';
  }

  return result.market.status;
}

/**
 * Main sync function
 */
async function syncMarketStatuses() {
  console.log('=== Sync Market Statuses from Kalshi ===\n');

  // Check for API credentials
  if (!KALSHI_API_KEY_ID || !KALSHI_PRIVATE_KEY_PATH) {
    console.log('⚠ Kalshi API credentials not configured.');
    console.log('  Set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PATH in .env\n');
    process.exit(1);
  }

  const events = await getAllEarningsEvents();
  console.log(`Total events: ${events.length}\n`);

  let eventsUpdated = 0;
  let marketsChecked = 0;
  let marketsUpdated = 0;

  for (const event of events) {
    if (!event.markets || event.markets.length === 0) {
      continue;
    }

    let eventNeedsUpdate = false;
    const updatedMarkets = [];

    // Check first market to see if event is still active
    // (checking all markets would be too many API calls)
    const firstMarket = event.markets[0];
    const kalshiStatus = await getMarketStatus(firstMarket.ticker);
    marketsChecked++;

    console.log(`${event.company}: ${firstMarket.ticker} => ${kalshiStatus}`);

    // If first market is finalized, assume all markets are finalized
    if (kalshiStatus === 'finalized' || kalshiStatus === 'closed' || kalshiStatus === 'determined') {
      // Update all markets to finalized
      for (const market of event.markets) {
        updatedMarkets.push({
          ...market,
          status: kalshiStatus,
        });
        if (market.status !== kalshiStatus) {
          marketsUpdated++;
          eventNeedsUpdate = true;
        }
      }
    } else {
      // Keep existing market data
      updatedMarkets.push(...event.markets);
    }

    if (eventNeedsUpdate) {
      // Determine event status based on market status
      let eventStatus = event.status;
      if (kalshiStatus === 'finalized' || kalshiStatus === 'determined') {
        eventStatus = 'settled';
      } else if (kalshiStatus === 'closed') {
        eventStatus = 'closed';
      }

      await saveEarningsEvent({
        eventTicker: event.eventTicker,
        seriesTicker: event.seriesTicker,
        company: event.company,
        stockTicker: event.stockTicker,
        title: event.title,
        category: event.category,
        status: eventStatus,
        eventDate: event.eventDate,
        eventDateSource: event.eventDateSource,
        eventDateVerified: event.eventDateVerified,
        eventDateConfidence: event.eventDateConfidence,
        eventDateUpdatedAt: event.eventDateUpdatedAt,
        closeTime: event.closeTime,
        seekingAlphaUrl: event.seekingAlphaUrl,
        markets: updatedMarkets,
        totalVolume: event.totalVolume,
        marketCount: event.marketCount,
      });

      eventsUpdated++;
      console.log(`  ✓ Updated ${event.company} to ${eventStatus}`);
    }

    // Rate limit: wait 100ms between API calls
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n=== Summary ===');
  console.log(`Events checked: ${events.length}`);
  console.log(`Markets checked: ${marketsChecked}`);
  console.log(`Events updated: ${eventsUpdated}`);
  console.log(`Markets updated: ${marketsUpdated}`);
}

syncMarketStatuses()
  .then(() => {
    console.log('\nSync complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
