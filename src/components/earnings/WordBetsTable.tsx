// Word Bets Table Component
// Displays Kalshi MENTION word bets with sorting and selection

import { useState } from 'react';
import { type WordBet, type NewsRecency } from '@/hooks/useEarningsData';

// Sortable column header
function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`${className} cursor-pointer hover:text-white transition-colors ${
        isActive ? 'text-white font-medium' : 'text-slate-500'
      }`}
    >
      {label}
      {isActive && <span className="ml-1">↓</span>}
    </button>
  );
}

// Display news recency with visual hierarchy
function NewsRecencyDisplay({ recency }: { recency: NewsRecency }) {
  const { today, thisWeek, total } = recency;

  // No news at all
  if (total === 0) {
    return <span className="font-mono text-sm text-slate-600">—</span>;
  }

  // Show today count prominently if there are articles today
  if (today > 0) {
    return (
      <div className="flex flex-col items-center">
        <span className="font-mono text-sm text-yellow-300 font-bold">
          {today} today
        </span>
        {thisWeek > today && (
          <span className="font-mono text-[10px] text-slate-500">
            +{thisWeek - today} this week
          </span>
        )}
      </div>
    );
  }

  // Show this week count if no articles today
  if (thisWeek > 0) {
    return (
      <div className="flex flex-col items-center">
        <span className="font-mono text-sm text-yellow-400/70">
          {thisWeek} this week
        </span>
        {total > thisWeek && (
          <span className="font-mono text-[10px] text-slate-600">
            {total} total
          </span>
        )}
      </div>
    );
  }

  // Only older articles
  return (
    <span className="font-mono text-sm text-slate-500">
      {total} older
    </span>
  );
}

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
        // Sort by recency: today first, then thisWeek, then total
        const aScore = a.newsRecency.today * 1000 + a.newsRecency.thisWeek * 10 + a.newsRecency.total;
        const bScore = b.newsRecency.today * 1000 + b.newsRecency.thisWeek * 10 + b.newsRecency.total;
        return bScore - aScore;
      case 'volume':
        return b.volume - a.volume;
      default:
        return 0;
    }
  });

  return (
    <>
      {/* Loading indicator */}
      {loadingNews && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-slate-500 animate-pulse">Loading news...</span>
        </div>
      )}

      {/* Words Table */}
      <div className="card p-0 overflow-hidden">
        {/* Header - clickable columns for sorting */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs bg-slate-800/50 border-b border-slate-800">
          <div className="col-span-3 text-slate-500">Word</div>
          <SortableHeader
            label="Chance"
            sortKey="chance"
            currentSort={sortBy}
            onSort={setSortBy}
            className="col-span-2 text-center"
          />
          <SortableHeader
            label="Transcript"
            sortKey="transcript"
            currentSort={sortBy}
            onSort={setSortBy}
            className="col-span-1 text-center"
          />
          <SortableHeader
            label="News"
            sortKey="news"
            currentSort={sortBy}
            onSort={setSortBy}
            className="col-span-2 text-center"
          />
          <SortableHeader
            label="Volume"
            sortKey="volume"
            currentSort={sortBy}
            onSort={setSortBy}
            className="col-span-2 text-center"
          />
          <div className="col-span-2 text-center text-slate-500">Trade</div>
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

      {/* News Recency */}
      <div className="col-span-2 text-center">
        <NewsRecencyDisplay recency={bet.newsRecency} />
      </div>

      {/* Volume */}
      <div className="col-span-2 text-center">
        <span
          className={`font-mono text-sm ${
            bet.volume > 0 ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {bet.volume > 0 ? bet.volume.toLocaleString() : '—'}
        </span>
      </div>

      {/* Trade Buttons */}
      <div className="col-span-2 flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBetClick(bet, 'yes');
          }}
          className="flex-1 py-1 text-xs font-medium rounded bg-profit-500/10 text-profit-400
                   border border-profit-500/30 hover:bg-profit-500/20 transition-colors"
        >
          Y {bet.yesPrice}¢
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBetClick(bet, 'no');
          }}
          className="flex-1 py-1 text-xs font-medium rounded bg-loss-500/10 text-loss-400
                   border border-loss-500/30 hover:bg-loss-500/20 transition-colors"
        >
          N {bet.noPrice}¢
        </button>
      </div>
    </div>
  );
}
