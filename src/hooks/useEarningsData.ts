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

// Word bet with all analysis data
export interface WordBet {
  ticker: string;
  word: string;
  chance: number;
  yesPrice: number;
  noPrice: number;
  priceChange: number;
  volume: number;
  transcriptCount: number;
  trending: boolean;
  newsCount: number;
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

  // Convert markets to word bets with analysis
  // Use Kalshi markets if available, otherwise use earnings event markets from DynamoDB
  const wordBets: WordBet[] = markets.length > 0
    ? markets.map((m) => {
        const word = m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '';
        const yesPrice = Math.round((m.yes_bid || m.last_price || 0) * 100);
        const prevPrice = Math.round((m.previous_price || m.last_price || 0) * 100);

        // Count word in transcripts
        const transcriptCount = transcripts.reduce((sum, t) => {
          return sum + countOccurrences(t.content, word);
        }, 0);

        // Get news data
        const news = newsData[word.toLowerCase()];

        return {
          ticker: m.ticker,
          word,
          chance: yesPrice,
          yesPrice,
          noPrice: 100 - yesPrice,
          priceChange: yesPrice - prevPrice,
          volume: m.volume || 0,
          transcriptCount,
          trending: news?.trending || false,
          newsCount: news?.articleCount || 0,
        };
      })
    : (earningsEvent?.markets || []).map((m) => {
        // Count word in transcripts
        const transcriptCount = transcripts.reduce((sum, t) => {
          return sum + countOccurrences(t.content, m.word);
        }, 0);

        // Get news data
        const news = newsData[m.word.toLowerCase()];

        return {
          ticker: m.ticker,
          word: m.word,
          chance: m.yesPrice,
          yesPrice: m.yesPrice,
          noPrice: m.noPrice,
          priceChange: 0, // No price history in stored data
          volume: m.volume,
          transcriptCount,
          trending: news?.trending || false,
          newsCount: news?.articleCount || 0,
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
  };
}
