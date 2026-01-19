#!/usr/bin/env bun
/**
 * Set Event Dates from CloseTime
 *
 * Copies closeTime to eventDate and marks as verified for events
 * that have closeTime but no verified eventDate.
 *
 * Usage: bun run scripts/set-event-dates-from-closetime.ts
 */

import 'dotenv/config';
import {
  getAllEarningsEvents,
  updateEarningsEventDate,
} from '../server/lib/dynamodb';

async function setEventDatesFromCloseTime() {
  console.log('=== Set Event Dates from CloseTime ===\n');

  const events = await getAllEarningsEvents();
  console.log(`Total events: ${events.length}\n`);

  let updated = 0;
  let skipped = 0;
  let noCloseTime = 0;

  for (const event of events) {
    // Skip if already has verified eventDate
    if (event.eventDate && event.eventDateVerified) {
      skipped++;
      continue;
    }

    // Skip if no closeTime to copy from
    if (!event.closeTime) {
      noCloseTime++;
      console.log(`⚠ ${event.company}: No closeTime available`);
      continue;
    }

    // Copy closeTime to eventDate and mark as verified
    console.log(`✓ ${event.company}: Setting eventDate to ${event.closeTime}`);

    await updateEarningsEventDate(event.company, event.eventTicker, {
      eventDate: event.closeTime,
      source: 'kalshi',
      verified: true,
      confidence: 100,
    });

    updated++;
  }

  console.log('\n=== Summary ===');
  console.log(`Updated: ${updated}`);
  console.log(`Already verified: ${skipped}`);
  console.log(`No closeTime: ${noCloseTime}`);
  console.log(`Total: ${events.length}`);
}

setEventDatesFromCloseTime()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
