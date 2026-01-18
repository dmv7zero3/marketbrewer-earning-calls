// Data API Client - Transcripts, Notes, Bets, News
// Connects to Express server endpoints for DynamoDB persistence

const API_BASE = '/api';

// Types
export interface Transcript {
  PK: string;
  SK: string;
  eventTicker: string;
  company: string;
  date: string;
  quarter: string;
  year: number;
  content: string;
  wordCount: number;
  createdAt: string;

  // Source metadata (for verification)
  sourceUrl?: string;
  sourceTitle?: string;
  sourceDate?: string;
  sourceTicker?: string;

  // Verification fields
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  verifiedBy?: string;
  verificationNotes?: string;

  // Parsed/normalized data
  parsedCompany?: string;
  parsedQuarter?: string;
  parsedEarningsDate?: string;
}

export interface ResearchNote {
  PK: string;
  SK: string;
  eventTicker: string;
  company: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BetRecord {
  PK: string;
  SK: string;
  betId: string;
  eventTicker: string;
  marketTicker: string;
  company: string;
  word: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  orderId?: string;
  createdAt: string;
  settledAt?: string;
  result?: 'win' | 'loss' | 'void';
  pnl?: number;
}

export interface NewsResult {
  word: string;
  articleCount: number;
  trending: boolean;
  articles: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
  }>;
  cached: boolean;
}

export interface EarningsEvent {
  PK: string;
  SK: string;
  eventTicker: string;
  seriesTicker?: string;
  company: string;
  stockTicker?: string;
  title: string;
  category: string;
  status: 'upcoming' | 'active' | 'closed' | 'settled';
  eventDate?: string;
  closeTime?: string;
  seekingAlphaUrl?: string;
  markets: Array<{
    ticker: string;
    word: string;
    yesPrice: number;
    noPrice: number;
    lastPrice: number;
    volume: number;
    status: string;
  }>;
  totalVolume: number;
  marketCount: number;
  createdAt: string;
  updatedAt: string;
}

// Helper function
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

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ===========================================
// Transcript Functions
// ===========================================

export async function saveTranscript(data: {
  eventTicker: string;
  company: string;
  date: string;
  quarter: string;
  year: number;
  content: string;
}): Promise<Transcript> {
  return fetchApi('/transcripts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTranscript(eventTicker: string, date: string): Promise<Transcript | null> {
  try {
    return await fetchApi(`/transcripts/${encodeURIComponent(eventTicker)}/${encodeURIComponent(date)}`);
  } catch {
    return null;
  }
}

export async function getTranscriptsForCompany(eventTicker: string): Promise<Transcript[]> {
  return fetchApi(`/transcripts/${encodeURIComponent(eventTicker)}`);
}

export async function getAllTranscripts(): Promise<Transcript[]> {
  return fetchApi('/transcripts');
}

export async function getPendingTranscripts(): Promise<Transcript[]> {
  return fetchApi('/transcripts/pending');
}

export async function verifyTranscript(
  eventTicker: string,
  date: string,
  status: 'verified' | 'rejected',
  notes?: string
): Promise<void> {
  await fetchApi(`/transcripts/${encodeURIComponent(eventTicker)}/${encodeURIComponent(date)}/verify`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

// ===========================================
// Research Note Functions
// ===========================================

export async function saveNote(data: {
  eventTicker: string;
  company: string;
  content: string;
  tags?: string[];
}): Promise<ResearchNote> {
  return fetchApi('/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getNotesForEvent(eventTicker: string): Promise<ResearchNote[]> {
  return fetchApi(`/notes/${encodeURIComponent(eventTicker)}`);
}

export async function deleteNote(eventTicker: string, timestamp: string): Promise<void> {
  await fetchApi(`/notes/${encodeURIComponent(eventTicker)}/${encodeURIComponent(timestamp)}`, {
    method: 'DELETE',
  });
}

// ===========================================
// Bet Record Functions
// ===========================================

export async function saveBet(data: {
  betId: string;
  eventTicker: string;
  marketTicker: string;
  company: string;
  word: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
}): Promise<BetRecord> {
  return fetchApi('/bets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getBet(betId: string): Promise<BetRecord | null> {
  try {
    return await fetchApi(`/bets/${encodeURIComponent(betId)}`);
  } catch {
    return null;
  }
}

export async function updateBetStatus(betId: string, status: string, orderId?: string): Promise<void> {
  await fetchApi(`/bets/${encodeURIComponent(betId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, orderId }),
  });
}

export async function getAllBets(status?: string): Promise<BetRecord[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchApi(`/bets${query}`);
}

// ===========================================
// News Functions (Google News RSS)
// ===========================================

export async function getNewsForWord(word: string, company?: string): Promise<NewsResult> {
  const query = company ? `?company=${encodeURIComponent(company)}` : '';
  return fetchApi(`/news/${encodeURIComponent(word)}${query}`);
}

export async function getNewsForWords(words: string[], company?: string): Promise<Record<string, NewsResult>> {
  return fetchApi('/news/batch', {
    method: 'POST',
    body: JSON.stringify({ words, company }),
  });
}

export async function getTrendingWords(words: string[], company?: string): Promise<string[]> {
  const result = await fetchApi<{ trending: string[] }>('/news/trending', {
    method: 'POST',
    body: JSON.stringify({ words, company }),
  });
  return result.trending;
}

// ===========================================
// Earnings Events Functions
// ===========================================

export async function getAllEarningsEvents(status?: string): Promise<EarningsEvent[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchApi(`/earnings${query}`);
}

export async function getEarningsEventsForCompany(company: string): Promise<EarningsEvent[]> {
  return fetchApi(`/earnings/company/${encodeURIComponent(company)}`);
}

export async function getEarningsEvent(company: string, eventTicker: string): Promise<EarningsEvent | null> {
  try {
    return await fetchApi(`/earnings/${encodeURIComponent(company)}/${encodeURIComponent(eventTicker)}`);
  } catch {
    return null;
  }
}

export async function saveEarningsEvent(data: {
  eventTicker: string;
  company: string;
  title: string;
  category?: string;
  status?: string;
  eventDate?: string;
  closeTime?: string;
  markets?: EarningsEvent['markets'];
}): Promise<EarningsEvent> {
  return fetchApi('/earnings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEarningsMarkets(
  company: string,
  eventTicker: string,
  markets: EarningsEvent['markets']
): Promise<void> {
  await fetchApi(`/earnings/${encodeURIComponent(company)}/${encodeURIComponent(eventTicker)}/markets`, {
    method: 'PATCH',
    body: JSON.stringify({ markets }),
  });
}

// ===========================================
// Historical Analysis Helpers
// ===========================================

export interface QuarterlyAnalysis {
  quarter: string;
  year: number;
  date: string;
  wordCount: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  totalPnl: number;
}

export async function getHistoricalAnalysis(eventTicker: string): Promise<QuarterlyAnalysis[]> {
  const [transcripts, bets] = await Promise.all([
    getTranscriptsForCompany(eventTicker),
    getAllBets(),
  ]);

  // Filter bets for this company
  const companyBets = bets.filter((b) => b.eventTicker === eventTicker);

  // Build quarterly analysis
  const analysisMap = new Map<string, QuarterlyAnalysis>();

  for (const transcript of transcripts) {
    const key = `${transcript.quarter}-${transcript.year}`;
    analysisMap.set(key, {
      quarter: transcript.quarter,
      year: transcript.year,
      date: transcript.date,
      wordCount: transcript.wordCount,
      betsPlaced: 0,
      betsWon: 0,
      betsLost: 0,
      totalPnl: 0,
    });
  }

  // Add bet stats
  for (const bet of companyBets) {
    // Find matching quarter from bet date
    const betDate = new Date(bet.createdAt);
    const quarter = `Q${Math.ceil((betDate.getMonth() + 1) / 3)}`;
    const year = betDate.getFullYear();
    const key = `${quarter}-${year}`;

    const existing = analysisMap.get(key);
    if (existing) {
      existing.betsPlaced++;
      if (bet.result === 'win') {
        existing.betsWon++;
        existing.totalPnl += bet.pnl || 0;
      } else if (bet.result === 'loss') {
        existing.betsLost++;
        existing.totalPnl += bet.pnl || 0;
      }
    }
  }

  // Sort by date descending (most recent first)
  return Array.from(analysisMap.values()).sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
}
