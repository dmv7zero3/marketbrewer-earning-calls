import { useState } from 'react';

// Types matching Kalshi MENTION contract structure
export interface MentionWord {
  word: string;
  chance: number; // 0-100 percentage
  yesPrice: number; // in cents
  noPrice: number; // in cents
  priceChange?: number; // percentage change (e.g., +3, -2)
  volume?: number;
  transcriptCount?: number; // How many times found in past transcripts
  newsCount?: number; // How many times found in news
  trending?: boolean;
}

export interface MentionContract {
  ticker: string;
  company: string;
  question: string; // "What will Netflix say during their next earnings call?"
  eventDate: string;
  eventTime: string;
  totalVolume: number;
  words: MentionWord[];
  priceHistory?: { timestamp: Date; word: string; yesPrice: number }[];
}

interface MentionBetCardProps {
  contract: MentionContract;
  onBet: (word: string, side: 'yes' | 'no', price: number) => void;
}

export function MentionBetCard({ contract, onBet }: MentionBetCardProps) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'chance' | 'transcript' | 'news'>('chance');

  // Sort words based on selected criteria
  const sortedWords = [...contract.words].sort((a, b) => {
    switch (sortBy) {
      case 'chance':
        return b.chance - a.chance;
      case 'transcript':
        return (b.transcriptCount || 0) - (a.transcriptCount || 0);
      case 'news':
        return (b.newsCount || 0) - (a.newsCount || 0);
      default:
        return 0;
    }
  });

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Mentions</p>
          <h2 className="text-lg font-semibold text-white">{contract.question}</h2>
          <p className="text-sm text-slate-400 mt-1">
            {contract.eventDate} · {contract.eventTime}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Volume</p>
          <p className="text-sm font-mono text-white">
            ${contract.totalVolume.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Sort by:</span>
        <div className="flex gap-1">
          {[
            { key: 'chance', label: 'Chance' },
            { key: 'transcript', label: 'Transcript' },
            { key: 'news', label: 'News' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key as typeof sortBy)}
              className={`px-2 py-1 text-xs rounded ${
                sortBy === opt.key
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Words Table Header */}
      <div className="grid grid-cols-12 gap-2 px-2 py-2 text-xs text-slate-500 border-b border-slate-800">
        <div className="col-span-4">Word</div>
        <div className="col-span-2 text-center">Chance</div>
        <div className="col-span-2 text-center">Transcript</div>
        <div className="col-span-2 text-center">Yes</div>
        <div className="col-span-2 text-center">No</div>
      </div>

      {/* Words List */}
      <div className="divide-y divide-slate-800">
        {sortedWords.map((word) => (
          <div
            key={word.word}
            className={`grid grid-cols-12 gap-2 px-2 py-3 items-center hover:bg-slate-800/50 cursor-pointer transition-colors ${
              selectedWord === word.word ? 'bg-slate-800/50' : ''
            }`}
            onClick={() => setSelectedWord(selectedWord === word.word ? null : word.word)}
          >
            {/* Word */}
            <div className="col-span-4">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{word.word}</span>
                {word.trending && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">
                    NEWS
                  </span>
                )}
              </div>
            </div>

            {/* Chance */}
            <div className="col-span-2 text-center">
              <span className="text-white font-bold">{word.chance}%</span>
              {word.priceChange !== undefined && word.priceChange !== 0 && (
                <span
                  className={`ml-1 text-xs ${
                    word.priceChange > 0 ? 'text-profit-500' : 'text-loss-500'
                  }`}
                >
                  {word.priceChange > 0 ? '▲' : '▼'}
                  {Math.abs(word.priceChange)}
                </span>
              )}
            </div>

            {/* Transcript Count */}
            <div className="col-span-2 text-center">
              {word.transcriptCount !== undefined ? (
                <span className={`font-mono text-sm ${
                  word.transcriptCount > 0 ? 'text-profit-400' : 'text-slate-500'
                }`}>
                  {word.transcriptCount}x
                </span>
              ) : (
                <span className="text-slate-600">-</span>
              )}
            </div>

            {/* Yes Button */}
            <div className="col-span-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBet(word.word, 'yes', word.yesPrice);
                }}
                className="w-full py-1.5 text-sm font-medium rounded bg-profit-500/10 text-profit-400
                         border border-profit-500/30 hover:bg-profit-500/20 transition-colors"
              >
                Yes {word.yesPrice}¢
              </button>
            </div>

            {/* No Button */}
            <div className="col-span-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onBet(word.word, 'no', word.noPrice);
                }}
                className="w-full py-1.5 text-sm font-medium rounded bg-loss-500/10 text-loss-400
                         border border-loss-500/30 hover:bg-loss-500/20 transition-colors"
              >
                No {word.noPrice}¢
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Word Details */}
      {selectedWord && (
        <div className="mt-4 p-4 bg-slate-800 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-3">
            Analysis: "{selectedWord}"
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs mb-1">Past Transcripts</p>
              <p className="text-white font-mono">
                {sortedWords.find((w) => w.word === selectedWord)?.transcriptCount || 0} mentions
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Recent News</p>
              <p className="text-white font-mono">
                {sortedWords.find((w) => w.word === selectedWord)?.newsCount || 0} articles
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Kalshi Volume</p>
              <p className="text-white font-mono">
                ${sortedWords.find((w) => w.word === selectedWord)?.volume?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for dashboard listing
interface MentionBetRowProps {
  contract: MentionContract;
  topWords?: number;
}

export function MentionBetRow({ contract, topWords = 3 }: MentionBetRowProps) {
  const sortedWords = [...contract.words]
    .sort((a, b) => b.chance - a.chance)
    .slice(0, topWords);

  return (
    <div className="card hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{contract.ticker}</span>
            <span className="text-slate-400 text-sm">{contract.company}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {contract.eventDate} · {contract.eventTime}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Volume</p>
          <p className="text-sm font-mono text-slate-300">
            ${contract.totalVolume.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Top Words Preview */}
      <div className="flex flex-wrap gap-2">
        {sortedWords.map((word) => (
          <div
            key={word.word}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg"
          >
            <span className="text-sm text-white">{word.word}</span>
            <span className="text-xs font-mono text-profit-400">{word.chance}%</span>
          </div>
        ))}
        {contract.words.length > topWords && (
          <div className="px-3 py-1.5 text-xs text-slate-500">
            +{contract.words.length - topWords} more
          </div>
        )}
      </div>
    </div>
  );
}
