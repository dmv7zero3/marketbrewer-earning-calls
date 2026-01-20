// Unit Tests for Google News RSS Integration
// Tests the news fetching and trend detection logic

import { describe, it, expect } from 'bun:test';
import {
  fetchNewsForWord,
  fetchNewsForWords,
  isWordTrending,
  getTrendingWords,
} from '../../server/lib/news';

describe('fetchNewsForWord', () => {
  it('should fetch news for a single word', async () => {
    const result = await fetchNewsForWord('technology');

    expect(result.word).toBe('technology');
    expect(typeof result.articleCount).toBe('number');
    expect(typeof result.trending).toBe('boolean');
    expect(Array.isArray(result.articles)).toBe(true);
    expect(typeof result.cached).toBe('boolean');
  });

  it('should include company name in search when provided', async () => {
    const result = await fetchNewsForWord('earnings', 'Apple');

    expect(result.word).toBe('earnings');
    expect(result.articleCount).toBeGreaterThanOrEqual(0);
  });

  it('should handle unusual words gracefully', async () => {
    const result = await fetchNewsForWord('xyzzy123notarealword');

    expect(result.word).toBe('xyzzy123notarealword');
    expect(result.articleCount).toBe(0);
    expect(result.trending).toBe(false);
    expect(result.articles).toEqual([]);
  });

  it('should use cache for repeated requests', async () => {
    // First request (may or may not be cached)
    const result1 = await fetchNewsForWord('AI');

    // Second request should use cache
    const result2 = await fetchNewsForWord('AI');

    expect(result2.cached).toBe(true);
    expect(result2.word).toBe(result1.word);
  });
});

describe('fetchNewsForWords', () => {
  it('should batch fetch news for multiple words', async () => {
    const words = ['cloud', 'revenue', 'growth'];
    const results = await fetchNewsForWords(words, 'Microsoft');

    expect(results instanceof Map).toBe(true);
    expect(results.size).toBe(3);

    for (const word of words) {
      const result = results.get(word.toLowerCase());
      expect(result).toBeDefined();
      expect(result?.word).toBe(word.toLowerCase());
    }
  });

  it('should handle empty array', async () => {
    const results = await fetchNewsForWords([]);
    expect(results.size).toBe(0);
  });

  it('should process words case-insensitively', async () => {
    const results = await fetchNewsForWords(['AI', 'ai', 'Ai']);

    // All should map to the same lowercase key
    expect(results.has('ai')).toBe(true);
  });
});

describe('isWordTrending', () => {
  it('should return boolean indicating trend status', async () => {
    const result = await isWordTrending('AI', 'Nvidia');
    expect(typeof result).toBe('boolean');
  });

  it('should return false for obscure words', async () => {
    const result = await isWordTrending('xyzzy123notaword');
    expect(result).toBe(false);
  });
});

describe('getTrendingWords', () => {
  it('should return array of trending words', async () => {
    const words = ['AI', 'cloud', 'xyzzynotreal'];
    const trending = await getTrendingWords(words, 'Google');

    expect(Array.isArray(trending)).toBe(true);
    // xyzzynotreal should definitely not be trending
    expect(trending).not.toContain('xyzzynotreal');
  });

  it('should return empty array when no words trend', async () => {
    const words = ['xyzzy1', 'xyzzy2', 'xyzzy3'];
    const trending = await getTrendingWords(words);

    expect(trending).toEqual([]);
  });

  it('should handle empty input', async () => {
    const trending = await getTrendingWords([]);
    expect(trending).toEqual([]);
  });
});

describe('Article Format', () => {
  it('should return articles with correct structure', async () => {
    const result = await fetchNewsForWord('technology');

    if (result.articles.length > 0) {
      const article = result.articles[0];
      expect(typeof article.title).toBe('string');
      expect(typeof article.source).toBe('string');
      expect(typeof article.url).toBe('string');
      expect(typeof article.publishedAt).toBe('string');
    }
  });

  it('should return all available articles (no artificial limit)', async () => {
    const result = await fetchNewsForWord('technology');
    // Google News RSS typically returns up to ~100 articles
    expect(result.articles.length).toBeGreaterThan(0);
    expect(result.articleCount).toBe(result.articles.length);
  });
});

describe('Trending Threshold', () => {
  it('should mark as trending based on recency (3+ today or 5+ this week)', async () => {
    // AI is usually trending
    const result = await fetchNewsForWord('AI');

    // Should be trending if 3+ articles today or 5+ this week
    const shouldBeTrending = result.recency.today >= 3 || result.recency.thisWeek >= 5;
    expect(result.trending).toBe(shouldBeTrending);
  });

  it('should return recency breakdown', async () => {
    const result = await fetchNewsForWord('AI');

    expect(typeof result.recency.today).toBe('number');
    expect(typeof result.recency.thisWeek).toBe('number');
    expect(typeof result.recency.total).toBe('number');
    expect(result.recency.total).toBe(result.articleCount);
    expect(result.recency.thisWeek).toBeGreaterThanOrEqual(result.recency.today);
  });

  it('should not mark as trending when no recent articles', async () => {
    // Very obscure word should have no articles
    const result = await fetchNewsForWord('xyzzynotreal123');

    expect(result.articleCount).toBe(0);
    expect(result.recency.today).toBe(0);
    expect(result.recency.thisWeek).toBe(0);
    expect(result.trending).toBe(false);
  });
});
