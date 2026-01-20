// Google News RSS Integration
// Free, unlimited, no API key required

import { cacheNewsResults, getCachedNews, type NewsCache } from './dynamodb';

interface GoogleNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface NewsRecency {
  today: number;
  thisWeek: number;
  total: number;
}

interface NewsResult {
  word: string;
  articleCount: number;
  recency: NewsRecency;
  trending: boolean;
  articles: NewsArticle[];
  cached: boolean;
}

// Parse RSS XML to extract news items
function parseRSS(xml: string): GoogleNewsItem[] {
  const items: GoogleNewsItem[] = [];

  // Extract items using regex (simple XML parsing)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];

    const title = extractTag(itemContent, 'title');
    const link = extractTag(itemContent, 'link');
    const pubDate = extractTag(itemContent, 'pubDate');
    const source = extractTag(itemContent, 'source');

    if (title && link) {
      items.push({
        title: decodeHTMLEntities(title),
        link,
        pubDate: pubDate || new Date().toISOString(),
        source: source || extractSourceFromLink(link),
      });
    }
  }

  return items;
}

function extractTag(content: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const cdataMatch = content.match(cdataRegex);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }

  // Handle regular tags
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractSourceFromLink(link: string): string {
  try {
    const url = new URL(link);
    return url.hostname.replace('www.', '');
  } catch {
    return 'Unknown';
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Calculate recency breakdown for articles
function calculateRecency(articles: NewsArticle[]): NewsRecency {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let today = 0;
  let thisWeek = 0;

  for (const article of articles) {
    try {
      const pubDate = new Date(article.publishedAt);
      if (pubDate >= todayStart) {
        today++;
        thisWeek++;
      } else if (pubDate >= weekAgo) {
        thisWeek++;
      }
    } catch {
      // Skip articles with invalid dates
    }
  }

  return {
    today,
    thisWeek,
    total: articles.length,
  };
}

// Build Google News RSS URL for a search query
function buildGoogleNewsURL(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
}

// Fetch news for a single word/phrase
export async function fetchNewsForWord(word: string, company?: string): Promise<NewsResult> {
  // Check cache first
  const cached = await getCachedNews(word);
  if (cached) {
    const recency = calculateRecency(cached.articles);
    return {
      word,
      articleCount: cached.articleCount,
      recency,
      trending: recency.today >= 3 || recency.thisWeek >= 5,
      articles: cached.articles,
      cached: true,
    };
  }

  // Build search query - combine word with company name for better relevance
  const query = company ? `${company} ${word}` : word;
  const url = buildGoogleNewsURL(query);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketBrewer/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Google News returned ${response.status}`);
    }

    const xml = await response.text();
    const items = parseRSS(xml);

    // Transform to our format (no cap - Google RSS typically returns ~100 max)
    const articles = items.map((item) => ({
      title: item.title,
      source: item.source,
      url: item.link,
      publishedAt: item.pubDate,
    }));

    // Calculate recency breakdown
    const recency = calculateRecency(articles);

    // Cache the results (6 hour TTL)
    await cacheNewsResults(word, articles);

    return {
      word,
      articleCount: articles.length,
      recency,
      trending: recency.today >= 3 || recency.thisWeek >= 5,
      articles,
      cached: false,
    };
  } catch (error) {
    console.error(`Failed to fetch news for "${word}":`, error);
    return {
      word,
      articleCount: 0,
      recency: { today: 0, thisWeek: 0, total: 0 },
      trending: false,
      articles: [],
      cached: false,
    };
  }
}

// Fetch news for multiple words (batch)
export async function fetchNewsForWords(
  words: string[],
  company?: string
): Promise<Map<string, NewsResult>> {
  const results = new Map<string, NewsResult>();

  // Process in parallel with rate limiting (5 concurrent)
  const batchSize = 5;

  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((word) => fetchNewsForWord(word, company))
    );

    batchResults.forEach((result) => {
      results.set(result.word.toLowerCase(), result);
    });

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < words.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

// Check if a word is trending (appears in 5+ articles in last 7 days)
export async function isWordTrending(word: string, company?: string): Promise<boolean> {
  const result = await fetchNewsForWord(word, company);
  return result.trending;
}

// Get trending words from a list
export async function getTrendingWords(
  words: string[],
  company?: string
): Promise<string[]> {
  const results = await fetchNewsForWords(words, company);
  const trending: string[] = [];

  results.forEach((result, word) => {
    if (result.trending) {
      trending.push(word);
    }
  });

  return trending;
}
