#!/usr/bin/env bun
/**
 * Check Event and Market Statuses in DynamoDB
 *
 * Diagnostic script to see current state of all events.
 *
 * Usage: bun run scripts/check-event-statuses.ts
 */

import 'dotenv/config';
import { getAllEarningsEvents } from '../server/lib/dynamodb';

async function checkStatuses() {
  console.log('=== Event and Market Status Check ===\n');

  const events = await getAllEarningsEvents();
  console.log(`Total events: ${events.length}\n`);

  // Count by event status
  const eventStatusCounts: Record<string, number> = {};
  const marketStatusCounts: Record<string, number> = {};

  for (const event of events) {
    // Count event statuses
    eventStatusCounts[event.status] = (eventStatusCounts[event.status] || 0) + 1;

    // Count market statuses
    if (event.markets) {
      for (const market of event.markets) {
        marketStatusCounts[market.status] = (marketStatusCounts[market.status] || 0) + 1;
      }
    }
  }

  console.log('Event Status Counts:');
  for (const [status, count] of Object.entries(eventStatusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log('\nMarket Status Counts:');
  for (const [status, count] of Object.entries(marketStatusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  // Check for events with 'active' or 'open' markets
  const eventsWithOpenMarkets = events.filter(e =>
    e.markets?.some(m => m.status === 'active' || m.status === 'open')
  );

  console.log(`\nEvents with open/active markets: ${eventsWithOpenMarkets.length}`);
  if (eventsWithOpenMarkets.length > 0) {
    for (const event of eventsWithOpenMarkets) {
      console.log(`  - ${event.company}: ${event.markets?.map(m => m.status).join(', ')}`);
    }
  }

  // Sample a few events to show full details
  console.log('\n=== Sample Events (first 3) ===');
  for (const event of events.slice(0, 3)) {
    console.log(`\n${event.company}:`);
    console.log(`  Event Status: ${event.status}`);
    console.log(`  Event Date: ${event.eventDate}`);
    console.log(`  Event Date Verified: ${event.eventDateVerified}`);
    console.log(`  Close Time: ${event.closeTime}`);
    console.log(`  Markets: ${event.markets?.length || 0}`);
    if (event.markets && event.markets.length > 0) {
      console.log(`  Market Statuses: ${event.markets.map(m => m.status).join(', ')}`);
    }
  }
}

checkStatuses()
  .then(() => {
    console.log('\nCheck complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });
