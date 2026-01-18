// Smoke Tests for MarketBrewer Earnings Call API
// Run with: bun test tests/smoke.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

const API_BASE = 'http://localhost:3001/api';

// Helper to make API requests
async function api(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return {
    status: response.status,
    data: await response.json().catch(() => null),
  };
}

describe('Health Check', () => {
  it('should return ok status', async () => {
    const { status, data } = await api('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
  });
});

describe('Kalshi API Proxy', () => {
  it('should proxy exchange status', async () => {
    const { status } = await api('/kalshi/exchange/status');
    // May return 401 without credentials or 200 with
    expect([200, 401, 403]).toContain(status);
  });

  it('should proxy markets endpoint', async () => {
    const { status } = await api('/kalshi/markets?limit=5');
    expect([200, 401, 403]).toContain(status);
  });
});

describe('Transcript API', () => {
  const testEventTicker = 'TEST-SMOKE-EVENT';
  let savedTranscriptDate: string;

  it('should save a transcript', async () => {
    const { status, data } = await api('/transcripts', {
      method: 'POST',
      body: JSON.stringify({
        eventTicker: testEventTicker,
        company: 'TestCorp',
        date: '2024-01-15',
        quarter: 'Q4',
        year: 2024,
        content: 'This is a test earnings call transcript with words like revenue growth and guidance.',
      }),
    });
    expect(status).toBe(201);
    expect(data.eventTicker).toBe(testEventTicker);
    expect(data.wordCount).toBeGreaterThan(0);
    savedTranscriptDate = data.date;
  });

  it('should get transcripts for event', async () => {
    const { status, data } = await api(`/transcripts/${testEventTicker}`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('should get all transcripts', async () => {
    const { status, data } = await api('/transcripts');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('should return 400 for missing fields', async () => {
    const { status } = await api('/transcripts', {
      method: 'POST',
      body: JSON.stringify({
        eventTicker: 'incomplete',
      }),
    });
    expect(status).toBe(400);
  });
});

describe('Notes API', () => {
  const testEventTicker = 'TEST-SMOKE-NOTES';

  it('should save a note', async () => {
    const { status, data } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({
        eventTicker: testEventTicker,
        company: 'TestCorp',
        content: 'This is a test research note for smoke testing.',
        tags: ['test', 'smoke'],
      }),
    });
    expect(status).toBe(201);
    expect(data.eventTicker).toBe(testEventTicker);
    expect(data.tags).toContain('test');
  });

  it('should get notes for event', async () => {
    const { status, data } = await api(`/notes/${testEventTicker}`);
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('should return 400 for missing fields', async () => {
    const { status } = await api('/notes', {
      method: 'POST',
      body: JSON.stringify({
        eventTicker: 'incomplete',
      }),
    });
    expect(status).toBe(400);
  });
});

describe('Bets API', () => {
  const testBetId = `smoke-test-${Date.now()}`;

  it('should save a bet', async () => {
    const { status, data } = await api('/bets', {
      method: 'POST',
      body: JSON.stringify({
        betId: testBetId,
        eventTicker: 'TEST-SMOKE-BETS',
        marketTicker: 'TEST-MARKET-123',
        company: 'TestCorp',
        word: 'growth',
        side: 'yes',
        action: 'buy',
        count: 10,
        price: 45,
      }),
    });
    expect(status).toBe(201);
    expect(data.betId).toBe(testBetId);
    expect(data.status).toBe('pending');
  });

  it('should get a bet by id', async () => {
    const { status, data } = await api(`/bets/${testBetId}`);
    expect(status).toBe(200);
    expect(data.betId).toBe(testBetId);
  });

  it('should get all bets', async () => {
    const { status, data } = await api('/bets');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('should update bet status', async () => {
    const { status } = await api(`/bets/${testBetId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'filled',
        orderId: 'order-123',
      }),
    });
    expect(status).toBe(200);
  });

  it('should filter bets by status', async () => {
    const { status, data } = await api('/bets?status=filled');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });
});

describe('News API (Google News RSS)', () => {
  it('should fetch news for a word', async () => {
    const { status, data } = await api('/news/AI?company=Nvidia');
    expect(status).toBe(200);
    expect(data.word).toBe('AI');
    expect(typeof data.articleCount).toBe('number');
    expect(typeof data.trending).toBe('boolean');
  });

  it('should batch fetch news for multiple words', async () => {
    const { status, data } = await api('/news/batch', {
      method: 'POST',
      body: JSON.stringify({
        words: ['revenue', 'growth', 'AI'],
        company: 'Microsoft',
      }),
    });
    expect(status).toBe(200);
    expect(typeof data).toBe('object');
  });

  it('should get trending words', async () => {
    const { status, data } = await api('/news/trending', {
      method: 'POST',
      body: JSON.stringify({
        words: ['AI', 'cloud', 'revenue'],
        company: 'Amazon',
      }),
    });
    expect(status).toBe(200);
    expect(Array.isArray(data.trending)).toBe(true);
  });

  it('should return 400 for missing words array', async () => {
    const { status } = await api('/news/batch', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
  });
});

describe('Error Handling', () => {
  it('should return 404 for non-existent bet', async () => {
    const { status } = await api('/bets/non-existent-bet-id');
    expect(status).toBe(404);
  });

  it('should return 404 for non-existent transcript', async () => {
    const { status } = await api('/transcripts/non-existent/2024-01-01');
    expect(status).toBe(404);
  });
});

console.log('Smoke tests completed!');
