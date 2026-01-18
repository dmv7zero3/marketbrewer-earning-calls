// Unit Tests for Earnings Events Operations
// Tests the earnings event data layer and word markets

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  saveEarningsEvent,
  getEarningsEvent,
  getAllEarningsEvents,
  getEarningsEventsForCompany,
  updateEarningsEventMarkets,
  deleteEarningsEvent,
  type EarningsEvent,
} from '../../server/lib/dynamodb';

// Test data
const TEST_COMPANY = 'UnitTestCompany';
const TEST_EVENT_TICKER = 'MENTION-UNITTEST';

describe('Earnings Event Operations', () => {
  // Clean up before tests
  beforeAll(async () => {
    try {
      await deleteEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);
    } catch {
      // Ignore if doesn't exist
    }
  });

  // Clean up after tests
  afterAll(async () => {
    try {
      await deleteEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);
    } catch {
      // Ignore if doesn't exist
    }
  });

  it('should save a new earnings event', async () => {
    const markets = [
      {
        ticker: `${TEST_EVENT_TICKER}-GROWTH-W1`,
        word: 'growth',
        yesPrice: 65,
        noPrice: 35,
        lastPrice: 65,
        volume: 10000,
        status: 'open',
      },
      {
        ticker: `${TEST_EVENT_TICKER}-REVENUE-W2`,
        word: 'revenue',
        yesPrice: 72,
        noPrice: 28,
        lastPrice: 72,
        volume: 15000,
        status: 'open',
      },
    ];

    const eventData = {
      eventTicker: TEST_EVENT_TICKER,
      company: TEST_COMPANY,
      title: `What will ${TEST_COMPANY} say during their next earnings call?`,
      category: 'earnings-call',
      status: 'active' as const,
      eventDate: '2026-02-15T21:00:00Z',
      closeTime: '2026-02-15T21:00:00Z',
      markets,
      totalVolume: markets.reduce((sum, m) => sum + m.volume, 0),
      marketCount: markets.length,
    };

    const saved = await saveEarningsEvent(eventData);

    expect(saved.eventTicker).toBe(TEST_EVENT_TICKER);
    expect(saved.company).toBe(TEST_COMPANY);
    expect(saved.PK).toBe(`EARNINGS#${TEST_COMPANY.toUpperCase()}`);
    expect(saved.SK).toBe(`EVENT#${TEST_EVENT_TICKER}`);
    expect(saved.markets.length).toBe(2);
    expect(saved.totalVolume).toBe(25000);
    expect(saved.marketCount).toBe(2);
    expect(saved.createdAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();
  });

  it('should retrieve an earnings event by company and ticker', async () => {
    const event = await getEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);

    expect(event).not.toBeNull();
    expect(event?.eventTicker).toBe(TEST_EVENT_TICKER);
    expect(event?.company).toBe(TEST_COMPANY);
    expect(event?.markets.length).toBe(2);
    expect(event?.status).toBe('active');
  });

  it('should return null for non-existent event', async () => {
    const event = await getEarningsEvent('NonExistent', 'NON-EXISTENT-TICKER');
    expect(event).toBeNull();
  });

  it('should get all earnings events', async () => {
    const events = await getAllEarningsEvents();

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.eventTicker === TEST_EVENT_TICKER)).toBe(true);
  });

  it('should filter events by status', async () => {
    const activeEvents = await getAllEarningsEvents('active');

    expect(Array.isArray(activeEvents)).toBe(true);
    expect(activeEvents.every((e) => e.status === 'active')).toBe(true);
  });

  it('should get events for a specific company', async () => {
    const events = await getEarningsEventsForCompany(TEST_COMPANY);

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.company === TEST_COMPANY)).toBe(true);
  });

  it('should update earnings event markets', async () => {
    const newMarkets = [
      {
        ticker: `${TEST_EVENT_TICKER}-AI-W1`,
        word: 'AI',
        yesPrice: 80,
        noPrice: 20,
        lastPrice: 80,
        volume: 25000,
        status: 'open',
      },
      {
        ticker: `${TEST_EVENT_TICKER}-CLOUD-W2`,
        word: 'cloud',
        yesPrice: 55,
        noPrice: 45,
        lastPrice: 55,
        volume: 12000,
        status: 'open',
      },
      {
        ticker: `${TEST_EVENT_TICKER}-MARGIN-W3`,
        word: 'margin',
        yesPrice: 40,
        noPrice: 60,
        lastPrice: 40,
        volume: 8000,
        status: 'open',
      },
    ];

    const totalVolume = newMarkets.reduce((sum, m) => sum + m.volume, 0);
    await updateEarningsEventMarkets(TEST_COMPANY, TEST_EVENT_TICKER, newMarkets, totalVolume);

    const updated = await getEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);
    expect(updated?.markets.length).toBe(3);
    expect(updated?.totalVolume).toBe(45000);
    expect(updated?.marketCount).toBe(3);
    expect(updated?.markets.some((m) => m.word === 'AI')).toBe(true);
  });

  it('should delete an earnings event', async () => {
    // First verify it exists
    const before = await getEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);
    expect(before).not.toBeNull();

    // Delete it
    await deleteEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);

    // Verify it's gone
    const after = await getEarningsEvent(TEST_COMPANY, TEST_EVENT_TICKER);
    expect(after).toBeNull();
  });
});

describe('Earnings Event Market Validation', () => {
  const MARKET_TEST_TICKER = 'MENTION-MARKET-TEST';
  const MARKET_TEST_COMPANY = 'MarketTestCorp';

  afterAll(async () => {
    try {
      await deleteEarningsEvent(MARKET_TEST_COMPANY, MARKET_TEST_TICKER);
    } catch {
      // Ignore
    }
  });

  it('should validate market data structure', async () => {
    const eventData = {
      eventTicker: MARKET_TEST_TICKER,
      company: MARKET_TEST_COMPANY,
      title: 'Market Structure Test',
      category: 'earnings-call',
      status: 'active' as const,
      markets: [
        {
          ticker: `${MARKET_TEST_TICKER}-TEST-W1`,
          word: 'test',
          yesPrice: 50,
          noPrice: 50,
          lastPrice: 50,
          volume: 1000,
          status: 'open',
        },
      ],
    };

    const saved = await saveEarningsEvent(eventData);
    const market = saved.markets[0];

    // Validate market structure
    expect(market.ticker).toBeDefined();
    expect(market.word).toBeDefined();
    expect(typeof market.yesPrice).toBe('number');
    expect(typeof market.noPrice).toBe('number');
    expect(market.yesPrice + market.noPrice).toBe(100);
    expect(typeof market.volume).toBe('number');
    expect(market.volume).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty markets array', async () => {
    const eventData = {
      eventTicker: MARKET_TEST_TICKER,
      company: MARKET_TEST_COMPANY,
      title: 'Empty Markets Test',
      category: 'earnings-call',
      status: 'upcoming' as const,
      markets: [],
      totalVolume: 0,
      marketCount: 0,
    };

    const saved = await saveEarningsEvent(eventData);
    expect(saved.markets).toEqual([]);
    expect(saved.totalVolume).toBe(0);
    expect(saved.marketCount).toBe(0);
  });

  it('should store total volume correctly', async () => {
    const markets = [
      { ticker: 'T1', word: 'a', yesPrice: 50, noPrice: 50, lastPrice: 50, volume: 100, status: 'open' },
      { ticker: 'T2', word: 'b', yesPrice: 50, noPrice: 50, lastPrice: 50, volume: 200, status: 'open' },
      { ticker: 'T3', word: 'c', yesPrice: 50, noPrice: 50, lastPrice: 50, volume: 300, status: 'open' },
    ];

    const eventData = {
      eventTicker: MARKET_TEST_TICKER,
      company: MARKET_TEST_COMPANY,
      title: 'Volume Test',
      category: 'earnings-call',
      markets,
      totalVolume: markets.reduce((sum, m) => sum + m.volume, 0),
      marketCount: markets.length,
    };

    const saved = await saveEarningsEvent(eventData);
    expect(saved.totalVolume).toBe(600);
    expect(saved.marketCount).toBe(3);
  });
});

describe('Earnings Event PK/SK Pattern', () => {
  it('should use correct PK pattern: EARNINGS#{COMPANY} (uppercased)', async () => {
    const events = await getAllEarningsEvents();
    if (events.length > 0) {
      events.forEach((event) => {
        expect(event.PK).toMatch(/^EARNINGS#/);
        expect(event.PK).toBe(`EARNINGS#${event.company.toUpperCase()}`);
      });
    }
  });

  it('should use correct SK pattern: EVENT#{eventTicker}', async () => {
    const events = await getAllEarningsEvents();
    if (events.length > 0) {
      events.forEach((event) => {
        expect(event.SK).toMatch(/^EVENT#/);
        expect(event.SK).toBe(`EVENT#${event.eventTicker}`);
      });
    }
  });
});

describe('Earnings Event Date Handling', () => {
  const DATE_TEST_TICKER = 'MENTION-DATE-TEST';
  const DATE_TEST_COMPANY = 'DateTestCorp';

  afterAll(async () => {
    try {
      await deleteEarningsEvent(DATE_TEST_COMPANY, DATE_TEST_TICKER);
    } catch {
      // Ignore
    }
  });

  it('should handle event dates correctly', async () => {
    const eventDate = '2026-03-15T21:00:00Z';
    const eventData = {
      eventTicker: DATE_TEST_TICKER,
      company: DATE_TEST_COMPANY,
      title: 'Date Test',
      category: 'earnings-call',
      eventDate,
      closeTime: eventDate,
      markets: [],
    };

    const saved = await saveEarningsEvent(eventData);
    expect(saved.eventDate).toBe(eventDate);
    expect(saved.closeTime).toBe(eventDate);

    // Verify dates can be parsed
    const parsedDate = new Date(saved.eventDate!);
    expect(parsedDate.getFullYear()).toBe(2026);
    expect(parsedDate.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(parsedDate.getDate()).toBe(15);
  });

  it('should handle missing event date', async () => {
    const eventData = {
      eventTicker: DATE_TEST_TICKER,
      company: DATE_TEST_COMPANY,
      title: 'No Date Test',
      category: 'earnings-call',
      markets: [],
    };

    const saved = await saveEarningsEvent(eventData);
    // eventDate should be undefined or not set
    expect(saved.eventDate).toBeUndefined();
  });
});
