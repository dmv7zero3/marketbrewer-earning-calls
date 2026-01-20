#!/usr/bin/env bun
/**
 * Clear unverified earnings event dates
 * Removes eventDate fields that are not verified or were derived from non-transcript sources.
 *
 * Usage: bun run scripts/clear-unverified-event-dates.ts
 */

import 'dotenv/config';
import { getAllEarningsEvents, saveEarningsEvent } from '../server/lib/dynamodb';

async function clearUnverifiedEventDates() {
  const events = await getAllEarningsEvents();
  let updated = 0;

  for (const event of events) {
    const shouldClear = !event.eventDateVerified;

    if (!shouldClear) continue;

    await saveEarningsEvent({
      eventTicker: event.eventTicker,
      seriesTicker: event.seriesTicker,
      company: event.company,
      stockTicker: event.stockTicker,
      title: event.title,
      category: event.category,
      status: event.status,
      eventDate: undefined,
      eventDateSource: undefined,
      eventDateVerified: false,
      eventDateConfidence: undefined,
      eventDateUpdatedAt: undefined,
      closeTime: event.closeTime,
      seekingAlphaUrl: event.seekingAlphaUrl,
      markets: event.markets,
      totalVolume: event.totalVolume,
      marketCount: event.marketCount,
    });

    updated++;
  }

  console.log(`Cleared unverified event dates: ${updated}`);
}

clearUnverifiedEventDates()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to clear event dates:', error);
    process.exit(1);
  });
