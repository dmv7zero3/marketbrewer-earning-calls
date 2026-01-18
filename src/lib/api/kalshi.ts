// Kalshi API Client
// Fetches data via the Express proxy server to handle authentication

const API_BASE = '/api/kalshi';

// Kalshi API Types
export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  status: string;
  result: string | null;
  close_time: string;
  expiration_time: string;
  yes_sub_title?: string;
  no_sub_title?: string;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  subtitle: string;
  category: string;
  mutually_exclusive: boolean;
  markets: KalshiMarket[];
}

export interface KalshiPosition {
  ticker: string;
  market_exposure: number;
  position: number;
  realized_pnl: number;
  resting_orders_count: number;
  total_traded: number;
}

export interface KalshiBalance {
  balance: number;
  payout: number;
}

export interface KalshiFill {
  trade_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  yes_price: number;
  no_price: number;
  created_time: string;
}

export interface KalshiOrderRequest {
  ticker: string;
  client_order_id: string;
  type: 'market' | 'limit';
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  count: number;
  yes_price?: number;
  no_price?: number;
  expiration_ts?: number;
}

export interface KalshiOrder {
  order_id: string;
  client_order_id: string;
  ticker: string;
  status: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: string;
  yes_price: number;
  no_price: number;
  created_time: string;
  expiration_time: string;
  taker_fill_count: number;
  taker_fill_cost: number;
  place_count: number;
  decrease_count: number;
  queue_position: number;
  remaining_count: number;
}

// API Functions
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Exchange Status
export async function getExchangeStatus(): Promise<{ trading_active: boolean }> {
  return fetchApi('/exchange/status');
}

// Portfolio
export async function getBalance(): Promise<KalshiBalance> {
  const data = await fetchApi<{ balance: number; payout: number }>('/portfolio/balance');
  return data;
}

export async function getPositions(): Promise<KalshiPosition[]> {
  const data = await fetchApi<{ market_positions: KalshiPosition[] }>('/portfolio/positions');
  return data.market_positions || [];
}

export async function getFills(params?: {
  ticker?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ fills: KalshiFill[]; cursor?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.ticker) queryParams.set('ticker', params.ticker);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);

  const query = queryParams.toString();
  return fetchApi(`/portfolio/fills${query ? `?${query}` : ''}`);
}

// Markets
export async function getMarkets(params?: {
  limit?: number;
  cursor?: string;
  event_ticker?: string;
  series_ticker?: string;
  status?: 'open' | 'closed' | 'settled';
  tickers?: string;
}): Promise<{ markets: KalshiMarket[]; cursor?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.event_ticker) queryParams.set('event_ticker', params.event_ticker);
  if (params?.series_ticker) queryParams.set('series_ticker', params.series_ticker);
  if (params?.status) queryParams.set('status', params.status);
  if (params?.tickers) queryParams.set('tickers', params.tickers);

  const query = queryParams.toString();
  return fetchApi(`/markets${query ? `?${query}` : ''}`);
}

export async function getMarket(ticker: string): Promise<{ market: KalshiMarket }> {
  return fetchApi(`/markets/${ticker}`);
}

// Get earnings call MENTION markets
export async function getEarningsMentionMarkets(): Promise<KalshiMarket[]> {
  // Kalshi uses series_ticker patterns for earnings mentions
  // Common patterns: EARNINGS-*, *-MENTION, *-EARNINGS
  const { markets } = await getMarkets({
    limit: 200,
    status: 'open',
  });

  // Filter for earnings call related markets
  return markets.filter((m) => {
    const titleLower = m.title.toLowerCase();
    const tickerLower = m.ticker.toLowerCase();
    return (
      titleLower.includes('earnings') ||
      titleLower.includes('earnings call') ||
      tickerLower.includes('earnings') ||
      tickerLower.includes('mention')
    );
  });
}

// Group markets by event (company earnings call)
export interface EarningsCallEvent {
  eventTicker: string;
  company: string;
  title: string;
  eventDate: string;
  totalVolume: number;
  markets: KalshiMarket[];
}

export async function getEarningsCallEvents(): Promise<EarningsCallEvent[]> {
  const markets = await getEarningsMentionMarkets();

  // Group by event_ticker
  const eventMap = new Map<string, EarningsCallEvent>();

  for (const market of markets) {
    const existing = eventMap.get(market.event_ticker);
    if (existing) {
      existing.markets.push(market);
      existing.totalVolume += market.volume;
    } else {
      // Extract company name from title (e.g., "What will Netflix say...")
      const titleMatch = market.title.match(/What will (\w+) say/i);
      const company = titleMatch ? titleMatch[1] : market.event_ticker;

      eventMap.set(market.event_ticker, {
        eventTicker: market.event_ticker,
        company,
        title: market.title,
        eventDate: market.expiration_time,
        totalVolume: market.volume,
        markets: [market],
      });
    }
  }

  return Array.from(eventMap.values()).sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );
}

// Orders
export async function getOrders(params?: {
  ticker?: string;
  status?: string;
}): Promise<{ orders: KalshiOrder[] }> {
  const queryParams = new URLSearchParams();
  if (params?.ticker) queryParams.set('ticker', params.ticker);
  if (params?.status) queryParams.set('status', params.status);

  const query = queryParams.toString();
  return fetchApi(`/portfolio/orders${query ? `?${query}` : ''}`);
}

export async function placeOrder(order: KalshiOrderRequest): Promise<{ order: KalshiOrder }> {
  return fetchApi('/portfolio/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

// Convert Kalshi market to our MentionWord format
export function marketToMentionWord(market: KalshiMarket): {
  word: string;
  chance: number;
  yesPrice: number;
  noPrice: number;
  priceChange: number;
  volume: number;
} {
  // Extract word from market title or subtitle
  // Title format: "Will [Company] say '[Word]'?" or similar
  const word = market.yes_sub_title || market.subtitle || market.ticker;

  // Calculate chance from yes_bid (market implied probability)
  const yesPrice = Math.round((market.yes_bid || market.last_price) * 100);
  const noPrice = 100 - yesPrice;
  const chance = yesPrice;

  // Price change from previous
  const prevPrice = Math.round((market.previous_price || market.last_price) * 100);
  const priceChange = yesPrice - prevPrice;

  return {
    word,
    chance,
    yesPrice,
    noPrice,
    priceChange,
    volume: market.volume,
  };
}
