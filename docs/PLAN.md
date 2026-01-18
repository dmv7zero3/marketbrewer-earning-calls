# MarketBrewer Earnings Call - Project Plan

## Overview

Build a personal earnings call betting assistant that:
1. Lists upcoming earnings calls with Kalshi prediction market data
2. Provides research tools (Seeking Alpha integration)
3. Allows placing bets through the Kalshi API
4. Tracks betting history and performance

## Phase 1: Project Setup (COMPLETED)

### 1.1 Initialize Project
- [x] Create CLAUDE.md with project context
- [x] Create .github/copilot-instructions.md
- [x] Create project plan (this document)
- [x] Initialize package.json with Bun
- [x] Configure TypeScript (tsconfig.json)
- [x] Configure Webpack (dev + prod)
- [x] Configure Tailwind CSS
- [x] Set up ESLint + Prettier

### 1.2 Basic React App
- [x] Create index.html template
- [x] Create React entry point (index.tsx)
- [x] Create App.tsx with Router
- [x] Create Dashboard and EarningsCallDetail pages
- [x] Verify build works with `bun run build`

### 1.3 Express Proxy Server
- [x] Create server/index.ts
- [x] Implement Kalshi RSA-PSS authentication
- [x] Create proxy endpoints for Kalshi API

### 1.4 Data Visualization
- [x] Add D3.js for charts
- [x] Create EarningsChart component (actual vs estimate)
- [x] Create PriceChart component (Kalshi price history)
- [x] Create WordFrequencyChart component

### 1.5 Transcript Analysis
- [x] Add transcript upload/storage UI
- [x] Implement word search following Kalshi MENTION rules
- [x] Create word frequency analysis utilities
- [x] Document Kalshi MENTION rules

## Phase 2: Core Features

### 2.1 Dashboard Page
- [ ] Fetch earnings calendar (Kalshi markets)
- [ ] Display earnings cards with:
  - Company ticker & name
  - Earnings date/time
  - Kalshi Yes/No prices
  - Volume indicator
- [ ] Add date filter (today, this week, next week)
- [ ] Add portfolio balance display

### 2.2 Earnings Call Detail Page
- [ ] Route: `/earnings/:ticker/:date`
- [ ] Company header with basic info
- [ ] Kalshi market panel:
  - Current Yes/No prices
  - Order book depth
  - Recent trades
- [ ] Historical earnings performance chart
- [ ] Analyst estimates (if available)
- [ ] Research notes section (local storage initially)

### 2.3 Bet Placement
- [ ] Bet form component
  - Side selector (Yes/No)
  - Contracts input
  - Price input (limit order)
  - Order preview
- [ ] Place order via Kalshi API
- [ ] Confirmation modal
- [ ] Error handling

## Phase 3: Data Persistence

### 3.1 DynamoDB Setup
- [ ] Create SAM template for DynamoDB table
- [ ] Define entity schemas (no GSIs)
- [ ] Create Lambda functions for CRUD

### 3.2 Research Notes
- [ ] Save notes to DynamoDB
- [ ] Load notes by ticker
- [ ] Add timestamps and source tracking

### 3.3 Bet History
- [ ] Store bet records
- [ ] Track outcomes (win/loss)
- [ ] Calculate P&L

## Phase 4: Seeking Alpha Integration

### 4.1 Research Data
- [ ] Analyst ratings
- [ ] Price targets
- [ ] Earnings estimates
- [ ] Historical beat/miss data

### 4.2 Display Integration
- [ ] Add research panel to detail page
- [ ] Show key metrics
- [ ] Link to full articles

## Phase 5: News Agent for MENTION Contracts

### 5.1 News Sentiment Analysis Agent

**Purpose:** Automatically check if words available in Kalshi MENTION contracts are trending in current news coverage. This helps identify which word bets have higher probability based on news sentiment.

**How it works:**
1. Fetch available MENTION contract words from Kalshi API
2. For each word, query news APIs (Google News, NewsAPI, etc.)
3. Count occurrences and analyze sentiment
4. Flag words that are trending (high news volume)
5. Display results alongside transcript word counts

**Implementation:**
- [ ] Create news API integration (NewsAPI.org or Google News RSS)
- [ ] Build Lambda function for scheduled news checks
- [ ] Store news sentiment data in DynamoDB
- [ ] Create NewsWordCheck component
- [ ] Add "Trending in News" indicator to word frequency charts
- [ ] Daily automated scans for all active MENTION contracts

**Data Schema:**
```
PK: NEWS#{word}
SK: DATE#{YYYY-MM-DD}
Data: {
  word: string,
  articleCount: number,
  sources: string[],
  sentiment: 'positive' | 'negative' | 'neutral',
  headlines: string[],
  lastChecked: timestamp
}
```

**UI Features:**
- Word cloud showing news-trending words
- Side-by-side comparison: transcript mentions vs news mentions
- Alert when a word starts trending
- Historical trend chart for word news coverage

### 5.2 Agent Automation
- [ ] Scheduled Lambda (every 6 hours) to check news for active contract words
- [ ] Push notifications when word trends significantly
- [ ] Auto-generate betting recommendations based on news + transcript analysis

## Phase 6: Polish & Deploy

### 5.1 UI Improvements
- [ ] Responsive design
- [ ] Loading states
- [ ] Error boundaries
- [ ] Toast notifications

### 5.2 Production Deployment
- [ ] S3 bucket setup
- [ ] CloudFront distribution
- [ ] Lambda functions deployment
- [ ] API Gateway configuration

## Tech Decisions

### Why These Choices?

| Decision | Rationale |
|----------|-----------|
| **Bun** | Faster than npm, drop-in replacement |
| **Webpack** | Proven, matches existing projects |
| **Tailwind** | Rapid styling, consistent with other projects |
| **Express proxy** | Simple Kalshi auth handling for dev |
| **No GSIs** | Cost savings, acceptable for single-user app |
| **TypeScript Lambda** | Type safety, matches babes-club pattern |

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser   │────▶│ Express/Lambda│────▶│  Kalshi API │
│  (React)    │◀────│    Proxy     │◀────│             │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │  DynamoDB   │
       │            │  (Notes,    │
       │            │   Bets)     │
       │            └─────────────┘
       │
       ▼
┌─────────────┐
│Seeking Alpha│
│  (Research) │
└─────────────┘
```

## Milestones

1. **Hello World** - React app running with Bun + Webpack
2. **Kalshi Connected** - Can fetch markets and portfolio
3. **Dashboard Live** - Earnings list displayed
4. **Detail Page** - Full analysis view
5. **Betting Works** - Can place orders
6. **Persistence** - Notes and history saved
7. **Production** - Deployed to AWS

## Open Questions

1. **Seeking Alpha API** - Do you have API access, or scrape/manual?
2. **Kalshi credentials** - Where is the RSA private key stored?
3. **AWS account** - Same as other MarketBrewer projects?
4. **Domain** - Will this get a custom domain?

## Next Steps

Immediate actions after this plan:
1. Run `bun init` and set up package.json
2. Install dependencies (react, webpack, tailwind, etc.)
3. Create webpack config files
4. Create basic React app with Hello World
5. Test `bun start` works
