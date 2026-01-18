# Claude Code Context - MarketBrewer Earnings Call

This file provides context for Claude Code when working on this codebase.

## Project Overview

Personal earnings call betting assistant that integrates with Kalshi prediction markets. Track 77+ companies with MENTION word bets, analyze earnings call transcripts, and detect trending words via Google News RSS.

## Quick Reference

### Commands

```bash
# Development
bun install              # Install dependencies
bun start                # Start dev server (port 3000)
bun run server           # Start backend API proxy (port 3001)
bun run dev:all          # Start both servers

# Testing
bun test                 # Run all tests (62 tests)
bun test:unit            # Unit tests only
bun test:smoke           # Smoke tests only
bun test:watch           # Watch mode

# Code Quality
bun run type-check       # TypeScript check
bun run lint             # ESLint
bun run lint:fix         # Fix lint issues

# Deployment
bun run build            # Build frontend to dist/
bun run deploy           # Deploy frontend to S3/CloudFront
bun run lambda:deploy    # Deploy Lambda functions via SAM
```

### Key Paths

| Path | Purpose |
|------|---------|
| `src/` | React frontend |
| `src/pages/` | Page components (Dashboard, EarningsCallDetail) |
| `src/components/earnings/` | Modular earnings UI components |
| `src/hooks/useEarningsData.ts` | Custom hook for earnings data |
| `src/lib/api/` | Kalshi and Data API clients |
| `src/lib/utils/wordAnalysis.ts` | Word counting utilities |
| `server/` | Express proxy server |
| `server/lib/dynamodb.ts` | DynamoDB operations |
| `server/lib/news.ts` | Google News RSS integration |
| `scripts/` | Utility scripts |
| `tests/` | Smoke and unit tests |

## Architecture Patterns

### Frontend Stack

- **React 18** with **TypeScript**
- **React Router v6** for client-side navigation
- **Webpack 5** for bundling
- **Tailwind CSS** for styling
- **D3.js** for word frequency visualizations

### Backend Stack

- **Express.js** proxy server for Kalshi API
- **Bun** runtime for server execution
- **DynamoDB** single-table design (no GSIs for cost optimization)
- **Google News RSS** for trend detection (free, no API key)

### Kalshi API Integration

The app integrates with Kalshi's prediction market API:
- RSA-PSS authentication with private key signing
- Proxy through Express server
- Endpoints: portfolio balance, positions, fills, markets, orders

### DynamoDB Single-Table Design

Table: `marketbrewer-earnings-call`
- PK/SK pattern
- **No GSIs** - Use scan with filters (cost optimization per user requirement)
- TTL: `expiresAt` for news cache

Entity patterns:
```
Transcripts:     PK=TRANSCRIPT#{eventTicker}  SK=DATE#{date}
Notes:           PK=NOTE#{eventTicker}        SK=TIMESTAMP#{timestamp}
Bets:            PK=BET#{betId}               SK=METADATA
EarningsEvents:  PK=EARNINGS#{company}        SK=EVENT#{eventTicker}
NewsCache:       PK=NEWSCACHE#{word}          SK=DATE#{date}
```

## Key Features

### Dashboard Page (`/`)
- Grid of 77+ earnings call events
- Search/filter by company name
- Stats: portfolio balance, positions, P&L, active events
- Click to view event detail

### Earnings Call Detail Page (`/earnings/:company/:eventTicker`)
- **Word Bets Tab**: Kalshi market prices, volume, implied probabilities
- **Transcripts Tab**: Upload/analyze quarterly transcripts
- **Notes Tab**: Personal research notes
- **History Tab**: Bet history and quarterly analysis
- **Bet Form**: Place orders through Kalshi API

### Kalshi MENTION Contract Rules

Word matching for MENTION contracts:

**Included (count as matches):**
- Exact word (case-insensitive)
- Plurals: "growth" → "growths"
- Possessives: "Tesla" → "Tesla's"

**Excluded (do NOT count):**
- Grammatical inflections: "grow" ≠ "growing"
- Closed compounds: "fire" ≠ "firetruck"
- Partial matches: "revenue" ≠ "prerevenue"

## API Endpoints

### Kalshi Proxy

| Endpoint | Description |
|----------|-------------|
| `GET /api/kalshi/portfolio/balance` | Account balance |
| `GET /api/kalshi/portfolio/positions` | Current positions |
| `GET /api/kalshi/markets` | Market listings |
| `POST /api/kalshi/portfolio/orders` | Place order |

### Earnings Events

| Endpoint | Description |
|----------|-------------|
| `GET /api/earnings` | List all events (77+) |
| `GET /api/earnings/company/:company` | Events for company |
| `GET /api/earnings/:company/:eventTicker` | Single event |
| `POST /api/earnings` | Create/update event |

### Data Persistence

| Endpoint | Description |
|----------|-------------|
| `POST /api/transcripts` | Save transcript |
| `GET /api/transcripts/:eventTicker` | Get transcripts |
| `POST /api/notes` | Save note |
| `GET /api/notes/:eventTicker` | Get notes |
| `POST /api/bets` | Save bet |
| `GET /api/bets` | Get all bets |

### News (Google RSS)

| Endpoint | Description |
|----------|-------------|
| `GET /api/news/:word` | News for word |
| `POST /api/news/batch` | Batch fetch |
| `POST /api/news/trending` | Get trending words |

## Environment Variables

```env
# Kalshi API (required)
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_PRIVATE_KEY_PATH=~/.ssh/your-private-key.pem

# AWS
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=marketbrewer-earnings-call

# Server
SERVER_PORT=3001
```

## Important Notes

1. **No GSIs in DynamoDB** - Cost optimization requirement. Use scan + filter for queries.

2. **Kalshi Auth** - Uses RSA-PSS signatures. Private key stored locally at `KALSHI_PRIVATE_KEY_PATH`.

3. **Route structure**: `/earnings/:company/:eventTicker` - company is URL-encoded

4. **77 companies imported** - Run `bun run scripts/import-earnings-events.ts` to refresh

5. **News caching** - 6-hour TTL in DynamoDB with Google News RSS

## Data Flow

```
User visits dashboard
  → Fetch earnings events from DynamoDB (77+ companies)
  → Fetch Kalshi balance/positions
  → Display grid with search

User clicks company
  → Fetch event from DynamoDB
  → Fetch markets from Kalshi API
  → Fetch transcripts, notes, bets from DynamoDB
  → Fetch news for words
  → Display detail page with tabs

User places bet
  → POST to Kalshi API via proxy
  → Save bet record to DynamoDB
  → Update UI
```

## Testing

- **62 tests total**: 21 smoke tests + 41 unit tests
- All tests pass with `bun test`
- Key test files:
  - `tests/smoke.test.ts` - API endpoint tests
  - `tests/unit/wordAnalysis.test.ts` - Word counting
  - `tests/unit/dynamodb.test.ts` - DB operations
  - `tests/unit/news.test.ts` - Google News RSS
