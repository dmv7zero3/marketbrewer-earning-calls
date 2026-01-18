# MarketBrewer Earnings Call

Personal earnings call betting assistant that integrates with Kalshi prediction markets. Track MENTION word bets, analyze earnings call transcripts, and detect trending words via Google News.

## Features

- **Earnings Call Events**: Browse 77+ companies with active MENTION markets on Kalshi
- **Word Bet Analysis**: View word prices, implied probabilities, and volume
- **Transcript Analysis**: Upload and analyze earnings call transcripts, track word frequency across quarters
- **News Integration**: Detect trending words via Google News RSS (free, no API key needed)
- **Bet Tracking**: Track betting history and performance quarter-over-quarter, year-over-year
- **Research Notes**: Save notes for each earnings event

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, D3.js
- **Backend**: Express.js proxy server (Bun runtime)
- **Database**: DynamoDB (single-table design, no GSIs for cost optimization)
- **APIs**: Kalshi Trading API, Google News RSS

## Quick Start

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Kalshi API credentials

# Start both servers
bun run dev:all

# Or start individually:
bun start        # Frontend on port 3000
bun run server   # Backend on port 3001
```

## Environment Variables

```env
# Kalshi API (required)
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_PRIVATE_KEY_PATH=~/.ssh/your-private-key.pem

# AWS (for DynamoDB)
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=marketbrewer-earnings-call

# Server
SERVER_PORT=3001
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun start` | Start frontend dev server (port 3000) |
| `bun run server` | Start backend API server (port 3001) |
| `bun run dev:all` | Start both servers concurrently |
| `bun test` | Run all tests |
| `bun test:unit` | Run unit tests only |
| `bun test:smoke` | Run smoke tests only |
| `bun run type-check` | TypeScript type checking |
| `bun run lint` | ESLint |
| `bun run build` | Production build |

## Project Structure

```
marketbrewer-earnings-call/
├── src/                    # React frontend
│   ├── pages/              # Page components
│   │   ├── Dashboard.tsx   # Main dashboard with event list
│   │   └── EarningsCallDetail.tsx  # Event detail page
│   ├── components/         # Reusable UI components
│   │   └── earnings/       # Earnings-specific components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # API clients and utilities
│   │   ├── api/            # Kalshi & data API clients
│   │   └── utils/          # Word analysis utilities
│   └── App.tsx             # Root component with routes
├── server/                 # Express backend
│   ├── index.ts            # Server entry point
│   └── lib/                # Server utilities
│       ├── dynamodb.ts     # DynamoDB operations
│       └── news.ts         # Google News RSS integration
├── scripts/                # Utility scripts
│   └── import-earnings-events.ts  # Import events to DynamoDB
├── tests/                  # Test files
│   ├── smoke.test.ts       # API smoke tests
│   └── unit/               # Unit tests
├── webpack/                # Webpack configuration
└── infrastructure/         # AWS SAM templates
```

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
| `GET /api/earnings` | List all earnings events |
| `GET /api/earnings/:company/:eventTicker` | Get specific event |
| `POST /api/earnings` | Create/update event |

### Data Persistence

| Endpoint | Description |
|----------|-------------|
| `POST /api/transcripts` | Save transcript |
| `GET /api/transcripts/:eventTicker` | Get transcripts |
| `POST /api/notes` | Save research note |
| `GET /api/notes/:eventTicker` | Get notes |
| `POST /api/bets` | Save bet record |
| `GET /api/bets` | Get all bets |

### News

| Endpoint | Description |
|----------|-------------|
| `GET /api/news/:word` | Get news for word |
| `POST /api/news/batch` | Batch fetch news |
| `POST /api/news/trending` | Get trending words |

## DynamoDB Schema

Single-table design with PK/SK pattern (no GSIs for cost optimization):

| Entity | PK | SK |
|--------|----|----|
| Transcript | `TRANSCRIPT#{eventTicker}` | `DATE#{date}` |
| Note | `NOTE#{eventTicker}` | `TIMESTAMP#{timestamp}` |
| Bet | `BET#{betId}` | `METADATA` |
| EarningsEvent | `EARNINGS#{company}` | `EVENT#{eventTicker}` |
| NewsCache | `NEWSCACHE#{word}` | `DATE#{date}` |

## Kalshi MENTION Rules

Words are counted following Kalshi's official MENTION rules:

- **Exact match**: Case-insensitive whole word matching
- **Plurals**: `word` matches `words` (word + s)
- **Possessives**: `word` matches `word's` and `words'`
- **NOT matched**: Compound words, grammatical inflections, partial matches

## Testing

```bash
# Run all tests (62 tests)
bun test

# Run smoke tests (21 tests)
bun test:smoke

# Run unit tests
bun test:unit

# Watch mode
bun test:watch
```

## License

Private - Personal use only
