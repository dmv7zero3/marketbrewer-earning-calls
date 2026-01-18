// Word Bets Table Component
// Displays Kalshi MENTION word bets with sorting and selection

import { useState } from 'react';
import { type WordBet } from '@/hooks/useEarningsData';

type SortKey = 'chance' | 'transcript' | 'news' | 'volume';

interface WordBetsTableProps {
  wordBets: WordBet[];
  loading: boolean;
  loadingNews: boolean;
  selectedWord: string | null;
  onSelectWord: (word: string | null, bet: WordBet | null) => void;
  onBetClick: (bet: WordBet, side: 'yes' | 'no') => void;
}

export function WordBetsTable({
  wordBets,
  loading,
  loadingNews,
  selectedWord,
  onSelectWord,
  onBetClick,
}: WordBetsTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('chance');

  // Sort word bets
  const sortedBets = [...wordBets].sort((a, b) => {
    switch (sortBy) {
      case 'chance':
        return b.chance - a.chance;
      case 'transcript':
        return b.transcriptCount - a.transcriptCount;
      case 'news':
        return b.newsCount - a.newsCount;
      case 'volume':
        return b.volume - a.volume;
      default:
        return 0;
    }
  });

  return (
    <>
      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Sort by:</span>
        {[
          { key: 'chance', label: 'Chance' },
          { key: 'transcript', label: 'Transcript' },
          { key: 'news', label: 'News' },
          { key: 'volume', label: 'Volume' },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key as SortKey)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              sortBy === opt.key
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
        {loadingNews && (
          <span className="text-xs text-slate-500 animate-pulse">Loading news...</span>
        )}
      </div>

      {/* Words Table */}
      <div className="card p-0 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-slate-500 bg-slate-800/50 border-b border-slate-800">
          <div className="col-span-3">Word</div>
          <div className="col-span-2 text-center">Chance</div>
          <div className="col-span-1 text-center">Transcript</div>
          <div className="col-span-2 text-center">News</div>
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
              <WordBetRow
                key={bet.ticker}
                bet={bet}
                isSelected={selectedWord === bet.word}
                onSelect={() =>
                  onSelectWord(selectedWord === bet.word ? null : bet.word, bet)
                }
                onBetClick={onBetClick}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Individual row component for better performance
interface WordBetRowProps {
  bet: WordBet;
  isSelected: boolean;
  onSelect: () => void;
  onBetClick: (bet: WordBet, side: 'yes' | 'no') => void;
}

function WordBetRow({ bet, isSelected, onSelect, onBetClick }: WordBetRowProps) {
  return (
    <div
      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-800/50 cursor-pointer transition-colors ${
        isSelected ? 'bg-slate-800/50' : ''
      }`}
      onClick={onSelect}
    >
      {/* Word */}
      <div className="col-span-3">
        <span className="text-white font-medium">{bet.word}</span>
        <div className="flex gap-1 mt-1">
          {bet.transcriptCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-profit-500/20 text-profit-400 rounded">
              {bet.transcriptCount}x
            </span>
          )}
          {bet.trending && (
            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">
              TRENDING
            </span>
          )}
        </div>
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
      <div className="col-span-1 text-center">
        <span
          className={`font-mono text-sm ${
            bet.transcriptCount > 0 ? 'text-profit-400' : 'text-slate-600'
          }`}
        >
          {bet.transcriptCount}
        </span>
      </div>

      {/* News Count */}
      <div className="col-span-2 text-center">
        <span
          className={`font-mono text-sm ${
            bet.newsCount > 0 ? 'text-yellow-400' : 'text-slate-600'
          }`}
        >
          {bet.newsCount} articles
        </span>
      </div>

      {/* Yes Button */}
      <div className="col-span-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBetClick(bet, 'yes');
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
            onBetClick(bet, 'no');
          }}
          className="w-full py-1.5 text-sm font-medium rounded bg-loss-500/10 text-loss-400
                   border border-loss-500/30 hover:bg-loss-500/20 transition-colors"
        >
          No {bet.noPrice}¢
        </button>
      </div>
    </div>
  );
}
