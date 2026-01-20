// Custom hook for fetching earnings call data
import { useState, useEffect, useCallback, useRef } from 'react';
import { getMarkets, type KalshiMarket } from '@/lib/api/kalshi';
import {
  getTranscriptsForCompany,
  getNotesForEvent,
  getAllBets,
  getNewsForWords,
  getHistoricalAnalysis,
  getEarningsEvent,
  type Transcript,
  type ResearchNote,
  type BetRecord,
  type NewsResult,
  type QuarterlyAnalysis,
  type EarningsEvent,
} from '@/lib/api/data';
import { countOccurrences } from '@/lib/utils/wordAnalysis';
import { useKalshiWebSocket, type TickerUpdate } from './useKalshiWebSocket';

// News recency breakdown
export interface NewsRecency {
  today: number;
  thisWeek: number;
  total: number;
}

// Word bet with all analysis data
export interface WordBet {
  ticker: string;
  word: string;
  chance: number;      // Last traded price (displayed as %)
  yesPrice: number;    // Best bid price (for placing YES orders)
  noPrice: number;     // Best bid price (for placing NO orders)
  lastPrice: number;   // Last traded price (same as chance)
  priceChange: number;
  volume: number;
  transcriptCount: number;
  trending: boolean;
  newsCount: number;
  newsRecency: NewsRecency;
}

interface UseEarningsDataResult {
  // Event data
  earningsEvent: EarningsEvent | null;

  // Market data
  markets: KalshiMarket[];
  wordBets: WordBet[];
  loading: boolean;
  error: string | null;

  // Company info
  companyName: string;

  // Transcript data
  transcripts: Transcript[];
  setTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;

  // Notes data
  notes: ResearchNote[];
  setNotes: React.Dispatch<React.SetStateAction<ResearchNote[]>>;

  // Bet history
  betHistory: BetRecord[];

  // Quarterly analysis
  quarterlyAnalysis: QuarterlyAnalysis[];

  // News data
  newsData: Record<string, NewsResult>;
  loadingNews: boolean;

  // Refresh functions
  refreshNews: () => Promise<void>;

  // Real-time WebSocket data
  isWebSocketConnected: boolean;
  isKalshiLive: boolean;
}

export function useEarningsData(company: string, eventTicker: string): UseEarningsDataResult {
  // Earnings event from DynamoDB
  const [earningsEvent, setEarningsEvent] = useState<EarningsEvent | null>(null);

  // Market data
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persisted data from DynamoDB
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [betHistory, setBetHistory] = useState<BetRecord[]>([]);
  const [quarterlyAnalysis, setQuarterlyAnalysis] = useState<QuarterlyAnalysis[]>([]);

  // News data
  const [newsData, setNewsData] = useState<Record<string, NewsResult>>({});
  const [loadingNews, setLoadingNews] = useState(false);

  // Company name from event or fallback
  const companyName = earningsEvent?.company || company || eventTicker;

  // WebSocket for real-time updates
  const {
    isConnected: isWebSocketConnected,
    isKalshiConnected: isKalshiLive,
    subscribe,
    onTicker,
  } = useKalshiWebSocket();

  // Handle real-time ticker updates
  useEffect(() => {
    onTicker((update: TickerUpdate) => {
      // Update markets with new data
      setMarkets((prevMarkets) =>
        prevMarkets.map((market) => {
          if (market.ticker === update.market_ticker) {
            return {
              ...market,
              yes_bid: update.yes_bid,
              yes_ask: update.yes_ask,
              no_bid: update.no_bid,
              no_ask: update.no_ask,
              last_price: update.last_price,
              volume: update.volume,
              volume_24h: update.volume_24h,
              open_interest: update.open_interest,
              // Update previous price for change calculation
              previous_price: market.last_price,
            };
          }
          return market;
        })
      );
    });
  }, [onTicker]);

  // Subscribe to WebSocket updates when markets are loaded
  useEffect(() => {
    if (markets.length > 0 && isWebSocketConnected) {
      const tickers = markets.map((m) => m.ticker);
      subscribe(tickers);
    }
  }, [markets.length, isWebSocketConnected, subscribe]);

  // Fetch earnings event from DynamoDB
  useEffect(() => {
    async function fetchEarningsEvent() {
      if (!company || !eventTicker) return;

      try {
        const event = await getEarningsEvent(company, eventTicker);
        setEarningsEvent(event);
      } catch (err) {
        console.error('Failed to fetch earnings event:', err);
      }
    }

    fetchEarningsEvent();
  }, [company, eventTicker]);

  // Fetch markets from Kalshi (if event has a series ticker)
  useEffect(() => {
    async function fetchMarkets() {
      if (!eventTicker) return;

      setLoading(true);
      setError(null);

      try {
        // Try to fetch markets from Kalshi using event ticker
        const { markets: allMarkets } = await getMarkets({
          event_ticker: eventTicker,
          status: 'open',
        });
        setMarkets(allMarkets);
      } catch (err) {
        // If no markets found, that's okay - we still have the event data
        console.log('No Kalshi markets found for event:', eventTicker);
        setMarkets([]);
      } finally {
        setLoading(false);
      }
    }

    fetchMarkets();
  }, [eventTicker]);

  // Fetch persisted data from DynamoDB
  useEffect(() => {
    async function fetchPersistedData() {
      if (!eventTicker) return;

      try {
        const [transcriptsData, notesData, betsData, analysisData] = await Promise.all([
          getTranscriptsForCompany(eventTicker).catch(() => []),
          getNotesForEvent(eventTicker).catch(() => []),
          getAllBets().catch(() => []),
          getHistoricalAnalysis(eventTicker).catch(() => []),
        ]);

        setTranscripts(transcriptsData);
        setNotes(notesData);
        setBetHistory(betsData.filter((b) => b.eventTicker === eventTicker));
        setQuarterlyAnalysis(analysisData);
      } catch (err) {
        console.error('Failed to fetch persisted data:', err);
      }
    }

    fetchPersistedData();
  }, [eventTicker]);

  // Track if news has been fetched for this event to prevent infinite loops
  const newsFetchedRef = useRef(false);
  const lastEventTickerRef = useRef<string>('');

  // Reset news fetched flag when event changes
  useEffect(() => {
    if (eventTicker !== lastEventTickerRef.current) {
      newsFetchedRef.current = false;
      lastEventTickerRef.current = eventTicker;
    }
  }, [eventTicker]);

  // Fetch news for words - manual refresh function
  const refreshNews = useCallback(async () => {
    // Get words from Kalshi markets or earnings event markets
    let words: string[] = [];
    if (markets.length > 0) {
      words = markets.map(
        (m) => m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || ''
      );
    } else if (earningsEvent?.markets?.length) {
      words = earningsEvent.markets.map((m) => m.word);
    }

    if (words.length === 0) return;

    setLoadingNews(true);
    try {
      const news = await getNewsForWords(words, companyName);
      setNewsData(news);
    } catch (err) {
      console.error('Failed to fetch news:', err);
    } finally {
      setLoadingNews(false);
    }
  }, [markets, earningsEvent?.markets, companyName]);

  // Auto-fetch news once when we have word data
  useEffect(() => {
    const hasKalshiMarkets = markets.length > 0;
    const hasEventMarkets = (earningsEvent?.markets?.length ?? 0) > 0;
    const hasWords = hasKalshiMarkets || hasEventMarkets;

    // Only fetch if we have words and haven't fetched yet
    if (hasWords && !newsFetchedRef.current && !loading) {
      newsFetchedRef.current = true;
      refreshNews();
    }
  }, [markets.length, earningsEvent?.markets?.length, loading, refreshNews]);

  // Default recency for when no news data available
  const defaultRecency: NewsRecency = { today: 0, thisWeek: 0, total: 0 };

  // Convert markets to word bets with analysis
  // Use Kalshi markets if available, otherwise use earnings event markets from DynamoDB
  // Note: Kalshi API returns prices as integers (0-100), not decimals
  // - last_price: the last traded price (what Kalshi displays as the %)
  // - yes_bid/no_bid: the best bid prices (what you'd get if placing an order)
  const wordBets: WordBet[] = markets.length > 0
    ? markets.map((m) => {
        const word = m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '';
        const lastPrice = m.last_price || 0;
        const yesPrice = m.yes_bid || lastPrice;
        const noPrice = m.no_bid || (100 - lastPrice);
        const prevPrice = m.previous_price || lastPrice;

        // Count word in transcripts
        const transcriptCount = transcripts.reduce((sum, t) => {
          return sum + countOccurrences(t.content, word);
        }, 0);

        // Get news data
        const news = newsData[word.toLowerCase()];

        return {
          ticker: m.ticker,
          word,
          chance: lastPrice,      // Display the last traded price as %
          yesPrice,               // Best bid for YES
          noPrice,                // Best bid for NO
          lastPrice,
          priceChange: lastPrice - prevPrice,
          volume: m.volume || 0,
          transcriptCount,
          trending: news?.trending || false,
          newsCount: news?.articleCount || 0,
          newsRecency: news?.recency || defaultRecency,
        };
      })
    : (earningsEvent?.markets || []).map((m) => {
        // Count word in transcripts
        const transcriptCount = transcripts.reduce((sum, t) => {
          return sum + countOccurrences(t.content, m.word);
        }, 0);

        // Get news data
        const news = newsData[m.word.toLowerCase()];

        // Use lastPrice for chance (Kalshi %), yesPrice/noPrice for order buttons
        const lastPrice = m.lastPrice || m.yesPrice;

        return {
          ticker: m.ticker,
          word: m.word,
          chance: lastPrice,      // Display the last traded price as %
          yesPrice: m.yesPrice,   // Best bid for YES
          noPrice: m.noPrice,     // Best bid for NO
          lastPrice,
          priceChange: 0,         // No price history in stored data
          volume: m.volume,
          transcriptCount,
          trending: news?.trending || false,
          newsCount: news?.articleCount || 0,
          newsRecency: news?.recency || defaultRecency,
        };
      });

  return {
    earningsEvent,
    markets,
    wordBets,
    loading,
    error,
    companyName,
    transcripts,
    setTranscripts,
    notes,
    setNotes,
    betHistory,
    quarterlyAnalysis,
    newsData,
    loadingNews,
    refreshNews,
    isWebSocketConnected,
    isKalshiLive,
  };
}
