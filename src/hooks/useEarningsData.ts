// Custom hook for fetching earnings call data
import { useState, useEffect, useCallback } from 'react';
import { getMarkets, type KalshiMarket } from '@/lib/api/kalshi';
import {
  getTranscriptsForCompany,
  getNotesForEvent,
  getAllBets,
  getNewsForWords,
  getHistoricalAnalysis,
  type Transcript,
  type ResearchNote,
  type BetRecord,
  type NewsResult,
  type QuarterlyAnalysis,
} from '@/lib/api/data';
import { extractCompanyName, countOccurrences } from '@/lib/utils/wordAnalysis';

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

export function useEarningsData(eventTicker: string): UseEarningsDataResult {
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

  // Derived company name
  const companyName = markets[0]
    ? extractCompanyName(markets[0].title, eventTicker)
    : eventTicker;

  // Fetch markets from Kalshi
  useEffect(() => {
    async function fetchMarkets() {
      if (!eventTicker) return;

      setLoading(true);
      setError(null);

      try {
        const { markets: allMarkets } = await getMarkets({
          event_ticker: eventTicker,
          status: 'open',
        });
        setMarkets(allMarkets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch markets');
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

  // Fetch news for words
  const refreshNews = useCallback(async () => {
    if (markets.length === 0) return;

    setLoadingNews(true);
    try {
      const words = markets.map(
        (m) => m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || ''
      );
      const news = await getNewsForWords(words, companyName);
      setNewsData(news);
    } catch (err) {
      console.error('Failed to fetch news:', err);
    } finally {
      setLoadingNews(false);
    }
  }, [markets, companyName]);

  // Auto-fetch news when markets load
  useEffect(() => {
    refreshNews();
  }, [refreshNews]);

  // Convert markets to word bets with analysis
  const wordBets: WordBet[] = markets.map((m) => {
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
  });

  return {
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
