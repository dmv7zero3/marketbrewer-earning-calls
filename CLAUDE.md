# Claude Code Context - MarketBrewer Earnings Call

This file provides context for Claude Code when working on this codebase.

## Project Overview

Personal earnings call betting assistant that integrates with Kalshi prediction markets and Seeking Alpha research. Helps make informed decisions on earnings call outcome bets.

## Quick Reference

### Commands

```bash
# Development
bun install              # Install dependencies
bun start                # Start dev server (port 3000)
bun run server           # Start backend API proxy (port 3001)
bun run dev:all          # Start both servers

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
| `src/components/` | Reusable UI components |
| `src/lib/` | API clients, utilities |
| `server/` | Express proxy server for Kalshi API |
| `functions/` | TypeScript Lambda functions |
| `infrastructure/` | AWS SAM template |

## Architecture Patterns

### Frontend Stack

- **React 18** with **TypeScript**
- **React Router v6** for client-side navigation
- **Webpack 5** for bundling
- **Tailwind CSS** for styling

### Backend Stack

- **Express.js** proxy server for Kalshi API (development)
- **TypeScript Lambda functions** for production (AWS SAM)
- **DynamoDB** single-table design (no GSIs for cost optimization)
- **S3 + CloudFront** for static hosting

### Kalshi API Integration

The app integrates with Kalshi's prediction market API:
- RSA-PSS authentication with private key signing
- Proxy through Express server (dev) or Lambda (prod)
- Endpoints: portfolio balance, positions, fills, markets, orders

### DynamoDB Single-Table Design

Table: `marketbrewer-earnings-call`
- PK/SK pattern
- **No GSIs** - Use scan with filters (cost optimization per user requirement)
- TTL: `expiresAt`

Entity patterns:
- Earnings Calls: `PK=EARNINGS#2025-01-22, SK=EVENT#{ticker}`
- Bets: `PK=BET#{betId}, SK=METADATA`
- Research Notes: `PK=RESEARCH#{ticker}, SK=NOTE#{timestamp}`
- Settings: `PK=SETTINGS, SK=USER`

### Seeking Alpha Integration

Research data source for earnings call analysis:
- Earnings call transcripts
- Analyst ratings and price targets
- Company fundamentals
- Historical earnings beats/misses

## Key Features

### Dashboard Page (`/`)
- List of upcoming earnings calls with bet opportunities
- Filter by date range
- Quick stats: portfolio balance, open positions

### Earnings Call Detail Page (`/earnings/:ticker/:date`)
- **Market Data Tab**: Kalshi market prices (yes/no), volume, historical earnings
- **Transcripts Tab**: Upload/store quarterly earnings call transcripts from Seeking Alpha
  - Search for specific words (follows Kalshi MENTION rules)
  - Highlight matches in transcripts
  - Store multiple quarters for trend analysis
- **Research Notes Tab**: Personal notes and analysis
- **Bet Form Sidebar**: Place orders through Kalshi API
- **Data Visualizations**: D3.js charts for earnings history, price movements

### Kalshi MENTION Contract Rules

Word matching for MENTION contracts (see `docs/KALSHI_RULES.md`):

**Included (count as matches):**
- Plurals & possessives: "Immigrant" → "Immigrants", "eggs'"
- Hyphenated compounds: "Palestine" → "pro-Palestine"
- Homonyms & homographs: "ICE" → "ice water", "bass" → both meanings
- Non-standard transliteration: "Zelensky" → "Zelenski"

**Excluded (do NOT count):**
- Grammatical inflections: "Immigrant" ≠ "Immigration"
- Closed compounds: "fire" ≠ "firetruck"
- Homophones: "write" ≠ "right"
- Other languages: "fire" ≠ "fuego"

## Environment Variables

```env
# Kalshi API
KALSHI_API_KEY_ID=your_key_id
KALSHI_PRIVATE_KEY_PATH=~/.kalshi/private_key.pem

# Seeking Alpha (if available)
SEEKING_ALPHA_API_KEY=your_key

# AWS (production)
API_BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com/v1
S3_BUCKET_PATH=s3://your-bucket/
CLOUDFRONT_DISTRIBUTION_ID=xxx
DYNAMODB_TABLE_NAME=marketbrewer-earnings-call

# Server
SERVER_PORT=3001
```

## API Endpoints

### Kalshi Proxy (via Express server)

| Endpoint | Description |
|----------|-------------|
| `GET /api/kalshi/exchange/status` | Exchange status |
| `GET /api/kalshi/portfolio/balance` | Account balance |
| `GET /api/kalshi/portfolio/positions` | Current positions |
| `GET /api/kalshi/portfolio/fills` | Trade history |
| `GET /api/kalshi/markets` | Market listings |
| `GET /api/kalshi/markets/:ticker` | Single market |
| `POST /api/kalshi/orders` | Place order |

### Lambda Endpoints (production)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/earnings` | List earnings calls |
| GET | `/earnings/{ticker}/{date}` | Get earnings call detail |
| POST | `/research/notes` | Save research note |
| GET | `/research/notes/{ticker}` | Get research notes |

## Important Notes

1. **No GSIs in DynamoDB** - Cost optimization requirement. Use scan + filter for queries.

2. **Kalshi Auth** - Uses RSA-PSS signatures. Private key stored locally at `KALSHI_PRIVATE_KEY_PATH`.

3. **Route additions** require updates in:
   - `src/routes.tsx`
   - `webpack/config/routes-meta.js` (for SEO if needed)

4. **Personal use first** - Built for single user. No auth system needed initially.

## Data Flow

```
User visits dashboard
  → Fetch Kalshi markets (earnings-related)
  → Fetch earnings calendar
  → Display combined list

User clicks earnings call
  → Fetch Kalshi market data
  → Fetch Seeking Alpha research (if available)
  → Load saved research notes from DynamoDB
  → Display analysis page with bet interface

User places bet
  → POST to Kalshi API via proxy
  → Store bet record in DynamoDB
  → Update UI with confirmation
```

## DynamoDB Entity Patterns (Extended)

```
Transcripts:
  PK: TRANSCRIPT#{ticker}
  SK: Q{quarter}#{year}  (e.g., Q4#2024)
  Data: { content, source, uploadedAt, wordCount }
```

## Documentation

- `.github/copilot-instructions.md` - Full development guide
- `docs/KALSHI_RULES.md` - Kalshi MENTION contract rules
- `docs/PLAN.md` - Project roadmap and milestones
- `resources/EARNINGSMENTION-KALISHI.pdf` - Original Kalshi rules PDF
