// Earnings Call Detail Page
// Main page for viewing and betting on word mentions for a company's earnings call

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEarningsData, type WordBet } from '@/hooks/useEarningsData';
import { type Transcript, type ResearchNote } from '@/lib/api/data';
import { WordFrequencyChart } from '@/components/WordFrequencyChart';
import {
  WordBetsTable,
  BetForm,
  TranscriptsTab,
  NotesTab,
  HistoryTab,
  QuickStats,
  MentionRules,
} from '@/components/earnings';

type TabId = 'market' | 'transcripts' | 'notes' | 'history';

function EarningsCallDetail() {
  const { company, eventTicker } = useParams<{ company: string; eventTicker: string }>();
  const decodedCompany = company ? decodeURIComponent(company) : '';
  const decodedEventTicker = eventTicker ? decodeURIComponent(eventTicker) : '';

  // Fetch all earnings data using custom hook
  const {
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
    isWebSocketConnected,
    isKalshiLive,
  } = useEarningsData(decodedCompany, decodedEventTicker);

  // UI state
  const [activeTab, setActiveTab] = useState<TabId>('market');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedBet, setSelectedBet] = useState<WordBet | null>(null);
  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes');

  // Handle word selection
  const handleSelectWord = (word: string | null, bet: WordBet | null) => {
    setSelectedWord(word);
    setSelectedBet(bet);
    if (bet) {
      setBetSide('yes'); // Default to yes side when selecting
    }
  };

  // Handle bet button click (Yes/No)
  const handleBetClick = (bet: WordBet, side: 'yes' | 'no') => {
    setSelectedWord(bet.word);
    setSelectedBet(bet);
    setBetSide(side);
  };

  // Handle order placed - clear selection
  const handleOrderPlaced = () => {
    setSelectedWord(null);
    setSelectedBet(null);
  };

  // Handle transcript saved
  const handleTranscriptSaved = (transcript: Transcript) => {
    setTranscripts([transcript, ...transcripts]);
  };

  // Handle note saved
  const handleNoteSaved = (note: ResearchNote) => {
    setNotes([note, ...notes]);
  };

  // Handle note deleted
  const handleNoteDeleted = (note: ResearchNote) => {
    setNotes(notes.filter((n) => n.SK !== note.SK));
  };

  // Handle transcript updated (verification status change)
  const handleTranscriptUpdated = (updatedTranscript: Transcript) => {
    setTranscripts(
      transcripts.map((t) => (t.SK === updatedTranscript.SK ? updatedTranscript : t))
    );
  };

  // Handle transcript deleted
  const handleTranscriptDeleted = (deletedTranscript: Transcript) => {
    setTranscripts(transcripts.filter((t) => t.SK !== deletedTranscript.SK));
  };

  // Tab configuration
  const tabs: { id: TabId; label: string }[] = [
    { id: 'market', label: 'Word Bets' },
    { id: 'transcripts', label: `Transcripts (${transcripts.length})` },
    { id: 'notes', label: `Notes (${notes.length})` },
    { id: 'history', label: 'History' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Back Link */}
      <Link
        to="/"
        className="inline-flex items-center text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Dashboard
      </Link>

      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Mentions</p>
          {earningsEvent?.stockTicker && (
            <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
              ${earningsEvent.stockTicker}
            </span>
          )}
          {/* Live WebSocket Status Indicator */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span
              className={`w-2 h-2 rounded-full ${
                isKalshiLive
                  ? 'bg-profit-500 animate-pulse'
                  : isWebSocketConnected
                  ? 'bg-yellow-500'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-xs text-slate-500">
              {isKalshiLive ? 'LIVE' : isWebSocketConnected ? 'Connecting...' : 'Offline'}
            </span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          What will {companyName} say during their next earnings call?
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
          <span>{wordBets.length} words available</span>
          <span>·</span>
          <span>
            ${wordBets.reduce((sum, b) => sum + b.volume, 0).toLocaleString()} total
            volume
          </span>
          <span>·</span>
          <span>{transcripts.length} transcripts saved</span>
          {earningsEvent?.eventDate && earningsEvent?.eventDateVerified && (
            <>
              <span>·</span>
              <span className="text-blue-400" title="Earnings Call">
                {new Date(earningsEvent.eventDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZoneName: 'short',
                })}
              </span>
            </>
          )}
          {earningsEvent?.closeTime && (
            <>
              <span>·</span>
              <span className="text-slate-500" title="Betting Closes">
                Betting closes:{' '}
                {new Date(earningsEvent.closeTime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </>
          )}
          {earningsEvent?.seekingAlphaUrl && (
            <>
              <span>·</span>
              <a
                href={earningsEvent.seekingAlphaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-profit-400 hover:text-profit-300 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Seeking Alpha Transcripts
              </a>
            </>
          )}
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
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
            <div key={`market-tab-${decodedEventTicker}`}>
              <WordBetsTable
                wordBets={wordBets}
                loading={loading}
                loadingNews={loadingNews}
                selectedWord={selectedWord}
                onSelectWord={handleSelectWord}
                onBetClick={handleBetClick}
              />

              {/* Word Frequency Chart */}
              {(transcripts.length > 0 || Object.keys(newsData).length > 0) && (
                <div className="card">
                  <WordFrequencyChart
                    data={wordBets.map((b) => ({
                      word: b.word,
                      count: b.transcriptCount,
                      inNews: b.trending,
                    }))}
                    title="Word Analysis: Transcript Count & News Trending"
                  />
                </div>
              )}
            </div>
          )}

          {/* Transcripts Tab */}
          {activeTab === 'transcripts' && (
            <TranscriptsTab
              eventTicker={decodedEventTicker}
              companyName={companyName}
              stockTicker={earningsEvent?.stockTicker}
              transcripts={transcripts}
              onTranscriptSaved={handleTranscriptSaved}
              onTranscriptUpdated={handleTranscriptUpdated}
              onTranscriptDeleted={handleTranscriptDeleted}
            />
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <NotesTab
              eventTicker={decodedEventTicker}
              companyName={companyName}
              notes={notes}
              onNoteSaved={handleNoteSaved}
              onNoteDeleted={handleNoteDeleted}
            />
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <HistoryTab
              companyName={companyName}
              quarterlyAnalysis={quarterlyAnalysis}
              betHistory={betHistory}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Bet Form */}
          <BetForm
            selectedBet={selectedBet}
            eventTicker={decodedEventTicker}
            companyName={companyName}
            initialSide={betSide}
            onOrderPlaced={handleOrderPlaced}
          />

          {/* Kalshi Rules */}
          <MentionRules />

          {/* Quick Stats */}
          <QuickStats
            wordBets={wordBets}
            transcripts={transcripts}
            betHistory={betHistory}
          />
        </div>
      </div>
    </div>
  );
}

export default EarningsCallDetail;
