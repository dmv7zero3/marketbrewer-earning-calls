import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMarkets, placeOrder, type KalshiMarket, type KalshiOrderRequest } from '@/lib/api/kalshi';
import { PriceChart } from '@/components/EarningsChart';
import { WordFrequencyChart, extractTopWords } from '@/components/WordFrequencyChart';

// Transcript type for quarterly earnings calls
interface Transcript {
  id: string;
  quarter: string;
  year: number;
  date: string;
  content: string;
  source: string;
  uploadedAt: string;
}

// Word bet with transcript analysis
interface WordBet {
  ticker: string;
  word: string;
  chance: number;
  yesPrice: number;
  noPrice: number;
  priceChange: number;
  volume: number;
  transcriptCount: number; // From past transcripts
}

function EarningsCallDetail() {
  const { eventTicker } = useParams<{ eventTicker: string }>();

  // Kalshi data state
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'market' | 'transcripts' | 'notes'>('market');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'chance' | 'transcript' | 'volume'>('chance');

  // Transcript state
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [newTranscript, setNewTranscript] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState('Q4 2024');
  const [searchWord, setSearchWord] = useState('');
  const [highlightedTranscript, setHighlightedTranscript] = useState<string | null>(null);

  // Bet form state
  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes');
  const [betContracts, setBetContracts] = useState(10);
  const [betPrice, setBetPrice] = useState(50);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Fetch markets on mount
  useEffect(() => {
    async function fetchMarkets() {
      if (!eventTicker) return;

      setLoading(true);
      setError(null);

      try {
        const { markets: allMarkets } = await getMarkets({
          event_ticker: decodeURIComponent(eventTicker),
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

  // Convert markets to word bets with transcript analysis
  const wordBets: WordBet[] = markets.map((m) => {
    const word = m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '';
    const yesPrice = Math.round((m.yes_bid || m.last_price || 0) * 100);
    const prevPrice = Math.round((m.previous_price || m.last_price || 0) * 100);

    // Count word in transcripts
    const transcriptCount = transcripts.reduce((sum, t) => {
      return sum + countOccurrences(t.content, word);
    }, 0);

    return {
      ticker: m.ticker,
      word,
      chance: yesPrice,
      yesPrice,
      noPrice: 100 - yesPrice,
      priceChange: yesPrice - prevPrice,
      volume: m.volume || 0,
      transcriptCount,
    };
  });

  // Sort word bets
  const sortedBets = [...wordBets].sort((a, b) => {
    switch (sortBy) {
      case 'chance':
        return b.chance - a.chance;
      case 'transcript':
        return b.transcriptCount - a.transcriptCount;
      case 'volume':
        return b.volume - a.volume;
      default:
        return 0;
    }
  });

  // Selected word details
  const selectedBet = selectedWord
    ? wordBets.find((b) => b.word === selectedWord)
    : null;

  // Calculate bet cost and payout
  const betCost = (betContracts * betPrice) / 100;
  const betPayout = betContracts;

  // Handle placing order
  const handlePlaceOrder = async () => {
    if (!selectedBet) return;

    setPlacingOrder(true);
    try {
      const order: KalshiOrderRequest = {
        ticker: selectedBet.ticker,
        client_order_id: `order-${Date.now()}`,
        type: 'limit',
        action: 'buy',
        side: betSide,
        count: betContracts,
        yes_price: betSide === 'yes' ? betPrice : undefined,
        no_price: betSide === 'no' ? betPrice : undefined,
      };

      await placeOrder(order);
      alert(`Order placed: ${betContracts} ${betSide.toUpperCase()} @ ${betPrice}¢`);
      setSelectedWord(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  // Transcript helpers
  const handleAddTranscript = () => {
    if (!newTranscript.trim()) return;

    const transcript: Transcript = {
      id: Date.now().toString(),
      quarter: selectedQuarter,
      year: parseInt(selectedQuarter.split(' ')[1]),
      date: new Date().toISOString().split('T')[0],
      content: newTranscript,
      source: 'Seeking Alpha',
      uploadedAt: new Date().toISOString(),
    };

    setTranscripts([transcript, ...transcripts]);
    setNewTranscript('');
  };

  function countOccurrences(text: string, word: string): number {
    if (!word.trim()) return 0;
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedWord}(?:s|'s|s')?\\b`, 'gi');
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  function highlightWord(text: string, word: string): string {
    if (!word.trim()) return text;
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escapedWord}(?:s|'s|s')?\\b`, 'gi');
    return text.replace(pattern, (match) => `[[HIGHLIGHT]]${match}[[/HIGHLIGHT]]`);
  }

  // Get company name from markets
  const companyName = markets[0]?.title.match(/What will (\w+) say/i)?.[1] || eventTicker;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Header */}
      <header className="mb-6">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Mentions</p>
        <h1 className="text-2xl font-bold text-white mb-2">
          What will {companyName} say during their next earnings call?
        </h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{markets.length} words available</span>
          <span>·</span>
          <span>
            ${wordBets.reduce((sum, b) => sum + b.volume, 0).toLocaleString()} total volume
          </span>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-loss-500/10 border border-loss-500/30 rounded-lg">
          <p className="text-loss-400 text-sm">{error}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-slate-800">
        {[
          { id: 'market', label: 'Word Bets' },
          { id: 'transcripts', label: 'Transcripts' },
          { id: 'notes', label: 'Research Notes' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-white border-profit-500'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Word Bets Tab */}
          {activeTab === 'market' && (
            <>
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Sort by:</span>
                {[
                  { key: 'chance', label: 'Chance' },
                  { key: 'transcript', label: 'Transcript' },
                  { key: 'volume', label: 'Volume' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key as typeof sortBy)}
                    className={`px-3 py-1 text-xs rounded ${
                      sortBy === opt.key
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Words Table */}
              <div className="card p-0 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-slate-500 bg-slate-800/50 border-b border-slate-800">
                  <div className="col-span-4">Word</div>
                  <div className="col-span-2 text-center">Chance</div>
                  <div className="col-span-2 text-center">Transcript</div>
                  <div className="col-span-2 text-center">Yes</div>
                  <div className="col-span-2 text-center">No</div>
                </div>

                {/* Loading State */}
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="animate-pulse">
                      <div className="h-4 w-32 bg-slate-800 rounded mx-auto mb-2" />
                      <div className="h-3 w-24 bg-slate-800 rounded mx-auto" />
                    </div>
                  </div>
                ) : sortedBets.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    No word bets found for this event
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {sortedBets.map((bet) => (
                      <div
                        key={bet.ticker}
                        className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-800/50 cursor-pointer transition-colors ${
                          selectedWord === bet.word ? 'bg-slate-800/50' : ''
                        }`}
                        onClick={() => {
                          setSelectedWord(selectedWord === bet.word ? null : bet.word);
                          setBetPrice(betSide === 'yes' ? bet.yesPrice : bet.noPrice);
                        }}
                      >
                        {/* Word */}
                        <div className="col-span-4">
                          <span className="text-white font-medium">{bet.word}</span>
                          {bet.transcriptCount > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-profit-500/20 text-profit-400 rounded">
                              IN TRANSCRIPT
                            </span>
                          )}
                        </div>

                        {/* Chance */}
                        <div className="col-span-2 text-center">
                          <span className="text-white font-bold">{bet.chance}%</span>
                          {bet.priceChange !== 0 && (
                            <span
                              className={`ml-1 text-xs ${
                                bet.priceChange > 0 ? 'text-profit-500' : 'text-loss-500'
                              }`}
                            >
                              {bet.priceChange > 0 ? '▲' : '▼'}
                              {Math.abs(bet.priceChange)}
                            </span>
                          )}
                        </div>

                        {/* Transcript Count */}
                        <div className="col-span-2 text-center">
                          <span
                            className={`font-mono text-sm ${
                              bet.transcriptCount > 0 ? 'text-profit-400' : 'text-slate-600'
                            }`}
                          >
                            {bet.transcriptCount}x
                          </span>
                        </div>

                        {/* Yes Button */}
                        <div className="col-span-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWord(bet.word);
                              setBetSide('yes');
                              setBetPrice(bet.yesPrice);
                            }}
                            className="w-full py-1.5 text-sm font-medium rounded bg-profit-500/10 text-profit-400
                                     border border-profit-500/30 hover:bg-profit-500/20 transition-colors"
                          >
                            Yes {bet.yesPrice}¢
                          </button>
                        </div>

                        {/* No Button */}
                        <div className="col-span-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWord(bet.word);
                              setBetSide('no');
                              setBetPrice(bet.noPrice);
                            }}
                            className="w-full py-1.5 text-sm font-medium rounded bg-loss-500/10 text-loss-400
                                     border border-loss-500/30 hover:bg-loss-500/20 transition-colors"
                          >
                            No {bet.noPrice}¢
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Word Frequency Chart (if transcripts exist) */}
              {transcripts.length > 0 && (
                <div className="card">
                  <WordFrequencyChart
                    data={wordBets.map((b) => ({
                      word: b.word,
                      count: b.transcriptCount,
                      inNews: false,
                    }))}
                    title="Word Mentions in Past Transcripts"
                  />
                </div>
              )}
            </>
          )}

          {/* Transcripts Tab */}
          {activeTab === 'transcripts' && (
            <>
              {/* Upload Transcript */}
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Add Earnings Call Transcript
                </h2>
                <p className="text-sm text-slate-400 mb-4">
                  Paste transcript from Seeking Alpha. Word counts will appear in the Word Bets tab.
                </p>

                <div className="mb-4">
                  <label className="text-sm text-slate-400 block mb-2">Quarter</label>
                  <select
                    value={selectedQuarter}
                    onChange={(e) => setSelectedQuarter(e.target.value)}
                    className="input w-full"
                  >
                    {['Q4 2024', 'Q3 2024', 'Q2 2024', 'Q1 2024', 'Q4 2023', 'Q3 2023'].map((q) => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={newTranscript}
                  onChange={(e) => setNewTranscript(e.target.value)}
                  className="input w-full h-48 resize-none font-mono text-sm"
                  placeholder="Paste earnings call transcript here..."
                />
                <button onClick={handleAddTranscript} className="btn-primary mt-3">
                  Save Transcript
                </button>
              </div>

              {/* Word Search */}
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Search Word in Transcripts
                </h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchWord}
                    onChange={(e) => setSearchWord(e.target.value)}
                    className="input flex-1"
                    placeholder="Search for word..."
                  />
                </div>
                {searchWord && transcripts.length > 0 && (
                  <div className="mt-3 p-3 bg-slate-800 rounded-lg">
                    <p className="text-sm text-slate-300">
                      Found{' '}
                      <span className="text-profit-500 font-bold">
                        {transcripts.reduce((sum, t) => sum + countOccurrences(t.content, searchWord), 0)}
                      </span>{' '}
                      occurrences of "{searchWord}"
                    </p>
                  </div>
                )}
              </div>

              {/* Saved Transcripts */}
              <div className="card">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Saved Transcripts ({transcripts.length})
                </h2>
                {transcripts.length === 0 ? (
                  <p className="text-slate-500 text-sm">No transcripts saved yet.</p>
                ) : (
                  <div className="space-y-4">
                    {transcripts.map((t) => (
                      <div key={t.id} className="bg-slate-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-semibold text-white">{t.quarter}</span>
                            <span className="text-slate-500 text-sm ml-2">via {t.source}</span>
                          </div>
                          <button
                            onClick={() =>
                              setHighlightedTranscript(highlightedTranscript === t.id ? null : t.id)
                            }
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            {highlightedTranscript === t.id ? 'Collapse' : 'Expand'}
                          </button>
                        </div>
                        {highlightedTranscript === t.id && (
                          <div className="mt-3 p-3 bg-slate-900 rounded text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {searchWord ? (
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: highlightWord(t.content, searchWord)
                                    .replace(/\[\[HIGHLIGHT\]\]/g, '<mark class="bg-yellow-500/30 text-yellow-300">')
                                    .replace(/\[\[\/HIGHLIGHT\]\]/g, '</mark>'),
                                }}
                              />
                            ) : (
                              t.content
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Research Notes Tab */}
          {activeTab === 'notes' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4">Research Notes</h2>
              <textarea
                className="input w-full h-64 resize-none"
                placeholder="Add your research notes here..."
              />
              <button className="btn-primary mt-3">Save Notes</button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Bet Form */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">
              {selectedBet ? `Bet: "${selectedBet.word}"` : 'Select a Word'}
            </h2>

            {selectedBet ? (
              <div className="space-y-4">
                {/* Side Selection */}
                <div>
                  <label className="text-sm text-slate-400 block mb-2">Side</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setBetSide('yes');
                        setBetPrice(selectedBet.yesPrice);
                      }}
                      className={`py-2 rounded font-medium transition-colors ${
                        betSide === 'yes'
                          ? 'bg-profit-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      YES {selectedBet.yesPrice}¢
                    </button>
                    <button
                      onClick={() => {
                        setBetSide('no');
                        setBetPrice(selectedBet.noPrice);
                      }}
                      className={`py-2 rounded font-medium transition-colors ${
                        betSide === 'no'
                          ? 'bg-loss-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      NO {selectedBet.noPrice}¢
                    </button>
                  </div>
                </div>

                {/* Contracts */}
                <div>
                  <label className="text-sm text-slate-400 block mb-2">Contracts</label>
                  <input
                    type="number"
                    value={betContracts}
                    onChange={(e) => setBetContracts(parseInt(e.target.value) || 1)}
                    className="input w-full"
                    min="1"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="text-sm text-slate-400 block mb-2">Limit Price (¢)</label>
                  <input
                    type="number"
                    value={betPrice}
                    onChange={(e) => setBetPrice(parseInt(e.target.value) || 1)}
                    className="input w-full"
                    min="1"
                    max="99"
                  />
                </div>

                {/* Summary */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Cost</span>
                    <span className="text-white">${betCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Potential Payout</span>
                    <span className="text-profit-500">${betPayout.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {placingOrder ? 'Placing Order...' : 'Place Order'}
                </button>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">
                Click on a word in the list to place a bet.
              </p>
            )}
          </div>

          {/* Kalshi Rules */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">MENTION Rules</h2>
            <div className="text-xs text-slate-400 space-y-2">
              <p><span className="text-profit-500">✓</span> Plurals & possessives</p>
              <p><span className="text-profit-500">✓</span> Hyphenated compounds</p>
              <p><span className="text-profit-500">✓</span> Homonyms & homographs</p>
              <p><span className="text-loss-500">✗</span> Grammatical inflections</p>
              <p><span className="text-loss-500">✗</span> Closed compounds</p>
              <p><span className="text-loss-500">✗</span> Other languages</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EarningsCallDetail;
