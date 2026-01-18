# MarketBrewer Earnings Call - Development Guide

## Architecture Snapshot

- **Static React SPA:** Built with React 18, TypeScript, React Router v6. Entry point at `src/index.tsx`, routes in `src/routes.tsx`.
- **Bun Package Manager:** Uses Bun instead of npm for faster installs and script execution.
- **Static Hosting on AWS S3 + CloudFront:** Webpack outputs to `/dist`, synced to S3 bucket, served via CloudFront.
- **Express Proxy Server (dev):** Local server proxies Kalshi API requests with RSA-PSS authentication.
- **TypeScript Lambda Functions (prod):** Deployed via AWS SAM for production API endpoints.
- **No SSR:** All routing/rendering is client-side.

## Tech Stack

### Frontend
- **React 18** with **TypeScript**
- **React Router v6** for navigation
- **Webpack 5** for bundling
- **Tailwind CSS** for styling
- **Bun** as package manager and script runner

### Backend
- **Express.js** proxy server (development)
- **TypeScript Lambda** functions (production)
- **AWS SAM** for deployment
- **DynamoDB** single-table design

### Infrastructure
- **AWS S3** - Static asset hosting
- **AWS CloudFront** - CDN
- **AWS API Gateway** - REST endpoints
- **AWS DynamoDB** - Data storage (NO GSIs - cost optimization)
- **AWS Lambda** - Serverless compute

## Build & Environment

### Prerequisites
- **Bun** >= 1.0
- **Node.js** >= 20 (for compatibility)
- **AWS CLI** (for deployment)
- **Kalshi API credentials** (RSA private key)

### Local Development

```bash
# Install dependencies
bun install

# Start frontend dev server (port 3000)
bun start

# Start backend proxy server (port 3001)
bun run server

# Start both concurrently
bun run dev:all

# Run type checking
bun run type-check

# Run linting
bun run lint
bun run lint:fix
```

### Environment Variables

Create `.env` in project root:

```env
# Kalshi API
KALSHI_API_KEY_ID=your_key_id
KALSHI_PRIVATE_KEY_PATH=~/.kalshi/private_key.pem

# Seeking Alpha (optional)
SEEKING_ALPHA_API_KEY=your_key

# AWS (production)
API_BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com/v1
S3_BUCKET_PATH=s3://your-bucket/
CLOUDFRONT_DISTRIBUTION_ID=xxx
DYNAMODB_TABLE_NAME=marketbrewer-earnings-call

# Server
SERVER_PORT=3001
```

## Project Structure

```
marketbrewer-earnings-call/
├── src/
│   ├── index.tsx              # Entry point
│   ├── App.tsx                # Root component
│   ├── routes.tsx             # React Router config
│   ├── pages/                 # Page components
│   │   ├── Dashboard.tsx      # Main earnings list
│   │   └── EarningsCallDetail.tsx  # Individual call page
│   ├── components/            # Reusable UI components
│   │   ├── EarningsCard.tsx
│   │   ├── BetForm.tsx
│   │   └── ResearchNotes.tsx
│   ├── lib/                   # Utilities and API clients
│   │   ├── api/
│   │   │   ├── kalshi.ts      # Kalshi API client
│   │   │   └── seekingAlpha.ts
│   │   └── utils/
│   └── styles/                # Global styles
├── server/                    # Express proxy server
│   ├── index.ts
│   └── kalshi-auth.ts         # RSA-PSS signing
├── functions/                 # Lambda functions
│   ├── api-earnings/
│   └── api-research/
├── infrastructure/
│   └── template.yaml          # SAM template
├── webpack/
│   ├── webpack.common.js
│   ├── webpack.dev.js
│   └── webpack.prod.js
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── .env
```

## Kalshi API Integration

### Authentication
Kalshi uses RSA-PSS signatures for API authentication:
1. Generate timestamp
2. Create signature payload: `{timestamp}{method}{path}`
3. Sign with RSA-PSS using SHA-256
4. Include headers: `KALSHI-ACCESS-KEY`, `KALSHI-ACCESS-SIGNATURE`, `KALSHI-ACCESS-TIMESTAMP`

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /exchange/status` | Check if exchange is open |
| `GET /portfolio/balance` | Account balance |
| `GET /portfolio/positions` | Current positions |
| `GET /portfolio/fills` | Trade history |
| `GET /markets` | List markets (filter by series_ticker) |
| `GET /markets/{ticker}` | Single market details |
| `POST /portfolio/orders` | Place an order |

### Market Filtering for Earnings
Filter markets by `series_ticker` prefix:
- Earnings calls typically use patterns like `EARNINGS-{TICKER}`
- Use query params: `?series_ticker=EARNINGS`

## DynamoDB Schema

**Table:** `marketbrewer-earnings-call`

**Keys:**
- `PK` (Partition Key): String
- `SK` (Sort Key): String

**NO GSIs** (cost optimization requirement)

### Entity Patterns

```
Earnings Calls:
  PK: EARNINGS#2025-01-22
  SK: EVENT#{ticker}
  Data: { ticker, companyName, date, time, kalshiMarketId, ... }

Bets:
  PK: BET#{betId}
  SK: METADATA
  Data: { ticker, date, side, contracts, price, status, ... }

Research Notes:
  PK: RESEARCH#{ticker}
  SK: NOTE#{timestamp}
  Data: { content, source, createdAt, ... }

User Settings:
  PK: SETTINGS
  SK: USER
  Data: { kalshiBalance, preferences, ... }
```

### Query Patterns (without GSIs)

Since no GSIs, use Scan with FilterExpression:
- List all earnings for a date: Scan where `PK begins_with EARNINGS#2025-01-22`
- List all bets: Scan where `PK begins_with BET#`
- Get notes for ticker: Query `PK = RESEARCH#{ticker}`

## Pages & Features

### Dashboard (`/`)
- List upcoming earnings calls
- Show Kalshi market prices (Yes/No)
- Filter by date range
- Portfolio summary (balance, open positions)
- Quick bet buttons

### Earnings Call Detail (`/earnings/:ticker/:date`)
- Company info and fundamentals
- Historical earnings performance
- Analyst estimates
- Kalshi market data (orderbook, volume)
- Research notes (add/view)
- Bet placement form

## Deployment

### Frontend

```bash
# Build production bundle
bun run build

# Deploy to S3 + invalidate CloudFront
bun run deploy
```

### Lambda Functions

```bash
# Build and deploy via SAM
bun run lambda:deploy
```

## Quality Guardrails

- Keep TypeScript strict mode enabled
- Run `bun run type-check` before commits
- Run `bun run lint` to validate code style
- Use path aliases (`@/*`) for imports
- Environment variables whitelisted in webpack config

## Route Additions

When adding new routes:
1. Add route in `src/routes.tsx`
2. Create page component in `src/pages/`
3. Update `webpack/config/routes-meta.js` for SEO metadata (if needed)

## Key Conventions

1. **Personal use first** - No auth system needed initially
2. **No GSIs** - Use scan + filter for DynamoDB queries
3. **Kalshi proxy** - All Kalshi calls go through Express server (dev) or Lambda (prod)
4. **Research notes** - Store in DynamoDB for persistence
5. **Bun over npm** - Use `bun` for all package management and scripts
