// Unit Tests for DynamoDB Operations
// Tests the data persistence layer

import { describe, it, expect, beforeAll } from 'bun:test';
import {
  saveTranscript,
  getTranscript,
  getTranscriptsForEvent,
  saveNote,
  getNotesForEvent,
  saveBet,
  getBet,
  updateBetStatus,
  getAllBets,
  cacheNewsResults,
  getCachedNews,
} from '../../server/lib/dynamodb';

// Test data
const TEST_EVENT_TICKER = 'UNIT-TEST-EVENT';
const TEST_DATE = '2024-01-20';

describe('Transcript Operations', () => {
  it('should save and retrieve a transcript', async () => {
    const transcriptData = {
      eventTicker: TEST_EVENT_TICKER,
      company: 'UnitTestCorp',
      date: TEST_DATE,
      quarter: 'Q4',
      year: 2024,
      content: 'This is a unit test transcript with some content for testing purposes.',
      wordCount: 12,
    };

    const saved = await saveTranscript(transcriptData);
    expect(saved.eventTicker).toBe(TEST_EVENT_TICKER);
    expect(saved.PK).toBe(`TRANSCRIPT#${TEST_EVENT_TICKER}`);
    expect(saved.SK).toBe(`DATE#${TEST_DATE}`);
    expect(saved.createdAt).toBeDefined();

    const retrieved = await getTranscript(TEST_EVENT_TICKER, TEST_DATE);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe(transcriptData.content);
    expect(retrieved?.wordCount).toBe(transcriptData.wordCount);
  });

  it('should return null for non-existent transcript', async () => {
    const result = await getTranscript('NON-EXISTENT', '2024-01-01');
    expect(result).toBeNull();
  });

  it('should get all transcripts for an event', async () => {
    // Save another transcript for the same event
    await saveTranscript({
      eventTicker: TEST_EVENT_TICKER,
      company: 'UnitTestCorp',
      date: '2024-04-20',
      quarter: 'Q1',
      year: 2024,
      content: 'Another test transcript.',
      wordCount: 3,
    });

    const transcripts = await getTranscriptsForEvent(TEST_EVENT_TICKER);
    expect(transcripts.length).toBeGreaterThanOrEqual(2);
    expect(transcripts.every((t) => t.eventTicker === TEST_EVENT_TICKER)).toBe(true);
  });
});

describe('Note Operations', () => {
  it('should save and retrieve notes', async () => {
    const noteData = {
      eventTicker: TEST_EVENT_TICKER,
      company: 'UnitTestCorp',
      content: 'This is a unit test research note.',
      tags: ['unit-test', 'research'],
    };

    const saved = await saveNote(noteData);
    expect(saved.eventTicker).toBe(TEST_EVENT_TICKER);
    expect(saved.PK).toBe(`NOTE#${TEST_EVENT_TICKER}`);
    expect(saved.SK).toContain('TIMESTAMP#');
    expect(saved.tags).toContain('unit-test');
    expect(saved.createdAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();

    const notes = await getNotesForEvent(TEST_EVENT_TICKER);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.some((n) => n.content === noteData.content)).toBe(true);
  });

  it('should handle empty tags array', async () => {
    const noteData = {
      eventTicker: TEST_EVENT_TICKER,
      company: 'UnitTestCorp',
      content: 'Note without tags.',
      tags: [],
    };

    const saved = await saveNote(noteData);
    expect(saved.tags).toEqual([]);
  });
});

describe('Bet Operations', () => {
  const testBetId = `unit-test-bet-${Date.now()}`;

  it('should save a bet with pending status', async () => {
    const betData = {
      betId: testBetId,
      eventTicker: TEST_EVENT_TICKER,
      marketTicker: 'UNIT-TEST-MARKET',
      company: 'UnitTestCorp',
      word: 'growth',
      side: 'yes' as const,
      action: 'buy' as const,
      count: 10,
      price: 45,
      status: 'pending' as const,
    };

    const saved = await saveBet(betData);
    expect(saved.betId).toBe(testBetId);
    expect(saved.PK).toBe(`BET#${testBetId}`);
    expect(saved.SK).toBe('METADATA');
    expect(saved.status).toBe('pending');
    expect(saved.createdAt).toBeDefined();
  });

  it('should retrieve a bet by id', async () => {
    const retrieved = await getBet(testBetId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.betId).toBe(testBetId);
    expect(retrieved?.word).toBe('growth');
    expect(retrieved?.count).toBe(10);
    expect(retrieved?.price).toBe(45);
  });

  it('should return null for non-existent bet', async () => {
    const result = await getBet('non-existent-bet');
    expect(result).toBeNull();
  });

  it('should update bet status', async () => {
    await updateBetStatus(testBetId, 'filled', 'order-abc-123');

    const updated = await getBet(testBetId);
    expect(updated?.status).toBe('filled');
    expect(updated?.orderId).toBe('order-abc-123');
  });

  it('should get all bets', async () => {
    const bets = await getAllBets();
    expect(Array.isArray(bets)).toBe(true);
    expect(bets.some((b) => b.betId === testBetId)).toBe(true);
  });

  it('should filter bets by status', async () => {
    const filledBets = await getAllBets('filled');
    expect(Array.isArray(filledBets)).toBe(true);
    expect(filledBets.every((b) => b.status === 'filled')).toBe(true);
  });
});

describe('News Cache Operations', () => {
  const testWord = 'unit-test-word';

  it('should cache news results with TTL', async () => {
    const articles = [
      {
        title: 'Test Article 1',
        source: 'Test Source',
        url: 'https://example.com/1',
        publishedAt: new Date().toISOString(),
      },
      {
        title: 'Test Article 2',
        source: 'Test Source 2',
        url: 'https://example.com/2',
        publishedAt: new Date().toISOString(),
      },
    ];

    const cached = await cacheNewsResults(testWord, articles);
    expect(cached.word).toBe(testWord.toLowerCase());
    expect(cached.articleCount).toBe(2);
    expect(cached.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should retrieve cached news', async () => {
    const cached = await getCachedNews(testWord);
    expect(cached).not.toBeNull();
    expect(cached?.word).toBe(testWord.toLowerCase());
    expect(cached?.articles.length).toBe(2);
  });

  it('should return null for non-cached word', async () => {
    const result = await getCachedNews('definitely-not-cached-word-xyz');
    expect(result).toBeNull();
  });
});

describe('PK/SK Pattern Validation', () => {
  it('should use correct PK pattern for transcripts', async () => {
    const transcript = await getTranscript(TEST_EVENT_TICKER, TEST_DATE);
    expect(transcript?.PK).toMatch(/^TRANSCRIPT#/);
    expect(transcript?.SK).toMatch(/^DATE#/);
  });

  it('should use correct PK pattern for notes', async () => {
    const notes = await getNotesForEvent(TEST_EVENT_TICKER);
    if (notes.length > 0) {
      expect(notes[0].PK).toMatch(/^NOTE#/);
      expect(notes[0].SK).toMatch(/^TIMESTAMP#/);
    }
  });

  it('should use correct PK pattern for bets', async () => {
    const bets = await getAllBets();
    if (bets.length > 0) {
      expect(bets[0].PK).toMatch(/^BET#/);
      expect(bets[0].SK).toBe('METADATA');
    }
  });
});
