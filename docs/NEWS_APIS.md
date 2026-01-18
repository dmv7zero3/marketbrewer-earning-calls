# News APIs for Word Trend Analysis

This document lists news APIs that can be used to check if words from Kalshi MENTION contracts are trending in the news. This helps validate betting decisions by correlating transcript word usage with current news coverage.

## Free APIs

### 1. NewsAPI.org (Free Tier)
**Website:** https://newsapi.org

**Free Tier:**
- 100 requests/day
- 1,000 articles returned per request
- Historical data: 1 month (free)
- Sources: 80,000+ worldwide

**Endpoints:**
- `/v2/everything` - Search articles by keyword
- `/v2/top-headlines` - Breaking news by category/country
- `/v2/sources` - Get available news sources

**Pros:**
- Easy to use, good documentation
- Covers major US business news sources
- Supports keyword search with filters

**Cons:**
- Free tier limited to 100 requests/day
- No commercial use on free plan
- Articles only from last month

**Example:**
```
GET https://newsapi.org/v2/everything?q=Netflix+subscriber&apiKey=YOUR_KEY
```

---

### 2. GNews API (Free Tier)
**Website:** https://gnews.io

**Free Tier:**
- 100 requests/day
- 10 articles per request
- No credit card required

**Endpoints:**
- `/api/v4/search` - Search articles by keyword
- `/api/v4/top-headlines` - Top headlines

**Pros:**
- Truly free, no credit card
- Good for quick checks
- International coverage

**Cons:**
- Limited to 10 articles per request
- Less comprehensive than NewsAPI

**Example:**
```
GET https://gnews.io/api/v4/search?q=Nvidia+AI&token=YOUR_TOKEN
```

---

### 3. Currents API (Free Tier)
**Website:** https://currentsapi.services

**Free Tier:**
- 200 requests/day
- No credit card required
- Historical data access

**Endpoints:**
- `/v1/search` - Search by keyword
- `/v1/latest-news` - Latest news

**Pros:**
- More generous free tier (200/day)
- Category filtering (business, tech)
- Language support

**Cons:**
- Smaller source pool
- Less known sources

---

### 4. MediaStack (Free Tier)
**Website:** https://mediastack.com

**Free Tier:**
- 500 requests/month
- 25 sources
- HTTPS only on paid plans

**Endpoints:**
- `GET /v1/news` - Search news articles

**Pros:**
- 500 requests/month
- Breaking news support

**Cons:**
- HTTPS requires paid plan
- Limited sources on free tier

---

### 5. Google News RSS (Free)
**Website:** https://news.google.com (RSS feeds)

**Free:**
- Unlimited requests
- No API key needed
- Real-time Google News data

**How to use:**
- Parse RSS feeds from Google News search
- URL: `https://news.google.com/rss/search?q=YOUR_KEYWORD&hl=en-US&gl=US&ceid=US:en`

**Pros:**
- Completely free
- No rate limits
- Comprehensive coverage
- Real-time data

**Cons:**
- RSS format requires parsing
- No structured API
- Less metadata than APIs

**Example:**
```
https://news.google.com/rss/search?q=Apple+earnings&hl=en-US&gl=US&ceid=US:en
```

---

### 6. Bing News Search API (Free Tier via Azure)
**Website:** https://azure.microsoft.com/services/cognitive-services/bing-news-search-api/

**Free Tier:**
- 1,000 transactions/month (S0 tier)
- Requires Azure account

**Pros:**
- Microsoft's comprehensive news index
- Structured response format
- Freshness filters

**Cons:**
- Requires Azure account setup
- More complex authentication

---

## Paid APIs (For Scale)

### 1. NewsAPI.org (Paid)
**Pricing:**
- Developer: $449/month - 250,000 requests/month
- Business: $449/month+ - Unlimited requests
- Historical access: 2+ years

**Best for:** Production use with high volume

---

### 2. Alpha Vantage News Sentiment
**Website:** https://www.alphavantage.co

**Free Tier:**
- 25 requests/day (limited news features)

**Paid:**
- $49.99/month - 1,200 requests/day with full news sentiment

**Unique Feature:** Sentiment scores for news articles (bullish/bearish)

---

### 3. Finnhub (Financial News)
**Website:** https://finnhub.io

**Free Tier:**
- 60 API calls/minute
- Company news endpoint included

**Paid:**
- $49/month+ for premium features

**Best for:** Company-specific financial news tied to earnings

---

### 4. Benzinga News API
**Website:** https://www.benzinga.com/apis

**Pricing:** Custom (enterprise)

**Best for:** Real-time financial news, earnings-specific coverage

---

### 5. Polygon.io News API
**Website:** https://polygon.io

**Pricing:**
- Free: Limited news
- Starter: $29/month
- Developer: $79/month

**Best for:** Ticker-specific news, financial data integration

---

## Recommended Strategy

### Phase 1: Development (Free APIs)
1. **Google News RSS** - Unlimited, good for testing word trends
2. **NewsAPI.org Free** - 100 requests/day for structured data
3. **GNews Free** - Backup when NewsAPI limit reached

### Phase 2: Production (If needed)
1. **NewsAPI.org Paid** - If volume exceeds free tier
2. **Alpha Vantage** - For sentiment analysis
3. **Finnhub** - For ticker-specific news

---

## Implementation Notes

### Data to Capture per Article
```typescript
interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  wordMatches: string[]; // Which bet words appear
  sentiment?: 'positive' | 'negative' | 'neutral';
}
```

### Query Strategy for MENTION Bets
1. Search for company name + each bet word
2. Example: "Netflix subscriber" or "Netflix gaming"
3. Count articles mentioning the word in last 7 days
4. Flag words with > 5 articles as "trending"

### Caching Strategy
- Cache news results for 6 hours
- Store in DynamoDB with TTL
- Reduces API calls, stays within free limits

---

## Next Steps

1. **Start with Google News RSS** - Free, no signup
2. **Add NewsAPI.org** - Better structure, 100/day
3. **Implement caching** - Reduce repeat queries
4. **Display in UI** - "Trending in News" badge on words
