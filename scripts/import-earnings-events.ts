#!/usr/bin/env bun
/**
 * Import Earnings Call Events Script
 * Parses earnings call event data and imports into DynamoDB
 *
 * Usage: bun run scripts/import-earnings-events.ts
 */

import 'dotenv/config';
import { saveEarningsEvent, getAllEarningsEvents } from '../server/lib/dynamodb';

// Companies extracted from Kalshi search results
// Format: { company, eventTicker (generated), title }
const EARNINGS_CALL_COMPANIES = [
  { company: 'EA', title: 'What will EA say during their next earnings call?' },
  { company: 'Netflix', title: 'What will Netflix say during their next earnings call?' },
  { company: 'Google', title: 'What will Google say during their next earnings call?' },
  { company: 'Tesla', title: 'What will Tesla say during their next earnings call?' },
  { company: 'Coinbase', title: 'What will Coinbase say during their next earnings call?' },
  { company: 'PayPal', title: 'What will PayPal say during their next earnings call?' },
  { company: 'Meta', title: 'What will Meta say during their next earnings call?' },
  { company: 'United Airlines', title: 'What will United Airlines say during their next earnings call?' },
  { company: 'Intel', title: 'What will Intel say during their next earnings call?' },
  { company: 'Nebius', title: 'What will Nebius say during their next earnings call?' },
  { company: 'Starbucks', title: 'What will Starbucks say during their next earnings call?' },
  { company: 'Microsoft', title: 'What will Microsoft say during their next earnings call?' },
  { company: 'Procter & Gamble', title: 'What will The Procter & Gamble say during their next earnings call?' },
  { company: 'American Airlines', title: 'What will American Airlines say during their next earnings call?' },
  { company: 'Johnson & Johnson', title: 'What will Johnson & Johnson say during their next earnings call?' },
  { company: 'GE Vernova', title: 'What will GE Vernova say during their next earnings call?' },
  { company: 'DraftKings', title: 'What will DraftKings say during their next earnings call?' },
  { company: 'Goldman Sachs', title: 'What will The Goldman Sachs say during their next earnings call?' },
  { company: 'BlackRock', title: 'What will BlackRock say during their next earnings call?' },
  { company: 'Bank of America', title: 'What will Bank of America say during their next earnings call?' },
  { company: 'Disney', title: 'What will Disney say during their next earnings call?' },
  { company: 'McDonald\'s', title: 'What will McDonald\'s say during their next earnings call?' },
  { company: 'Uber', title: 'What will Uber say during their next earnings call?' },
  { company: 'RBC', title: 'What will RBC say during their next earnings call?' },
  { company: 'John Deere', title: 'What will John Deere say during their next earnings call?' },
  { company: 'Chipotle', title: 'What will Chipotle say during their next earnings call?' },
  { company: 'Dollar General', title: 'What will Dollar General say on their Q4 2024 earnings call?' },
  { company: 'Chewy', title: 'What will Chewy say during their next earnings call?' },
  { company: 'Costco', title: 'What will Costco say during their next earnings call?' },
  { company: 'Ulta', title: 'What will Ulta say during their next earnings call?' },
  { company: 'Robinhood', title: 'What will Robinhood say during their next earnings call?' },
  { company: 'Wells Fargo', title: 'What will Wells Fargo say during their next earnings call?' },
  { company: 'Ford', title: 'What will Ford say on their next earnings call?' },
  { company: 'Oracle', title: 'What will Oracle say during their next earnings call?' },
  { company: 'Hewlett Packard', title: 'What will Hewlett Packard say during their next earnings call?' },
  { company: 'Walmart', title: 'What will Walmart say during their next earnings call?' },
  { company: 'Broadcom', title: 'What will Broadcom say during their next earnings call?' },
  { company: 'TSMC', title: 'What will TSMC say during their next earnings call?' },
  { company: 'Apple', title: 'What will Apple say during their next earnings call?' },
  { company: 'Coca-Cola', title: 'What will Coca-Cola say during their next earnings call?' },
  { company: 'Adobe', title: 'What will Adobe say on their Q1 FY2025 earnings call?' },
  { company: 'Amazon', title: 'What will Amazon say during their next earnings call?' },
  { company: 'Reddit', title: 'What will Reddit say during their next earnings call?' },
  { company: 'Nike', title: 'What will Nike say during their next earnings call?' },
  { company: 'Constellation Brands', title: 'What will Constellation Brands say during their next earnings call?' },
  { company: 'Snap', title: 'What will Snap say during their next earnings call?' },
  { company: 'JPMorgan', title: 'What will JPMorgan say during their next earnings call?' },
  { company: 'Delta', title: 'What will Delta say during their next earnings call?' },
  { company: 'Home Depot', title: 'What will Home Depot say during their next earnings call?' },
  { company: 'Kroger', title: 'What will Kroger say during their next earnings call?' },
  { company: 'Lyft', title: 'What will Lyft say during their next earnings call?' },
  { company: 'Hims', title: 'What will Hims say during their next earnings call?' },
  { company: 'Circle', title: 'What will Circle say during their next earnings call?' },
  { company: 'Albertsons', title: 'What will Albertsons say during their next earnings call?' },
  { company: 'CAVA', title: 'What will CAVA say during their next earnings call?' },
  { company: 'American Express', title: 'What will American Express say during their next earnings call?' },
  { company: 'FedEx', title: 'What will FedEx say during their next earnings call?' },
  { company: 'Berkshire Hathaway', title: 'What will Berkshire Hathaway say at their Shareholder Meeting?' },
  { company: 'PepsiCo', title: 'What will PepsiCo say during Their Next Earnings Call?' },
  { company: 'GameStop', title: 'What will GameStop Corp. say on their next earnings call?' },
  { company: 'Target', title: 'What will Target say during their next earnings call?' },
  { company: 'Airbnb', title: 'What will Airbnb say during their next earnings call?' },
  { company: 'Dell', title: 'What will Dell say during their next earnings call?' },
  { company: 'CoreWeave', title: 'What will CoreWeave say during their next earnings call?' },
  { company: 'AMC', title: 'What will AMC say on their next earnings call?' },
  { company: 'Palantir', title: 'What will Palantir say during their next earnings call?' },
  { company: 'NVIDIA', title: 'What will NVIDIA say during their next earnings call?' },
  { company: 'NIO', title: 'What will NIO say on their Q4 2024 earnings call?' },
  { company: 'MicroStrategy', title: 'What will MicroStrategy Incorporated say during their next earnings call?' },
  { company: 'Micron', title: 'What will Micron say during their post earnings analyst call?' },
  { company: 'Alibaba', title: 'What will Alibaba say on their next earnings call?' },
  { company: 'Cracker Barrel', title: 'What will Cracker Barrel say during their next earnings call?' },
  { company: 'CrowdStrike', title: 'What will CrowdStrike say during their next earnings call?' },
  { company: 'Celsius', title: 'What will Celsius say during their next earnings call?' },
  { company: 'Salesforce', title: 'What will Salesforce say during their next earnings call?' },
  { company: 'Roku', title: 'What will Roku say during their next earnings call?' },
  { company: 'Lucid', title: 'What will Lucid say on their next earnings call?' },
];

// Generate event ticker from company name
function generateEventTicker(company: string): string {
  // Create ticker-style identifier
  const cleanName = company
    .replace(/[&']/g, '')
    .replace(/\s+/g, '-')
    .toUpperCase();
  return `MENTION-${cleanName}`;
}

async function importEarningsEvents() {
  console.log('Starting earnings events import...\n');
  console.log(`Found ${EARNINGS_CALL_COMPANIES.length} companies to import\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const { company, title } of EARNINGS_CALL_COMPANIES) {
    const eventTicker = generateEventTicker(company);

    try {
      const event = await saveEarningsEvent({
        eventTicker,
        company,
        title,
        category: 'earnings-call',
        status: 'active',
        markets: [], // Will be populated when fetching from Kalshi
        totalVolume: 0,
        marketCount: 0,
      });

      console.log(`✓ Imported: ${company} (${eventTicker})`);
      imported++;
    } catch (error) {
      console.error(`✗ Error importing ${company}:`, error);
      errors++;
    }
  }

  console.log('\n--- Import Summary ---');
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${EARNINGS_CALL_COMPANIES.length}`);

  // List all events
  console.log('\n--- All Events in Database ---');
  const allEvents = await getAllEarningsEvents();
  console.log(`Total events in database: ${allEvents.length}`);
  allEvents.forEach(e => {
    console.log(`  - ${e.company}: ${e.eventTicker} (${e.status})`);
  });
}

// Run the import
importEarningsEvents()
  .then(() => {
    console.log('\nImport complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
