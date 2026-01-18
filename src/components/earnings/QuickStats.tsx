// Quick Stats Sidebar Component
// Display summary statistics for the earnings call

import { type WordBet } from '@/hooks/useEarningsData';
import { type Transcript, type BetRecord } from '@/lib/api/data';

interface QuickStatsProps {
  wordBets: WordBet[];
  transcripts: Transcript[];
  betHistory: BetRecord[];
}

export function QuickStats({ wordBets, transcripts, betHistory }: QuickStatsProps) {
  const wordsInTranscript = wordBets.filter((b) => b.transcriptCount > 0).length;
  const wordsTrending = wordBets.filter((b) => b.trending).length;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-white mb-4">Quick Stats</h2>
      <div className="space-y-3 text-sm">
        <StatRow
          label="Words in transcript"
          value={wordsInTranscript}
          className="text-white"
        />
        <StatRow
          label="Words trending"
          value={wordsTrending}
          className="text-yellow-400"
        />
        <StatRow
          label="Total transcripts"
          value={transcripts.length}
          className="text-white"
        />
        <StatRow
          label="Your bets"
          value={betHistory.length}
          className="text-white"
        />
      </div>
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: number;
  className?: string;
}

function StatRow({ label, value, className = 'text-white' }: StatRowProps) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${className}`}>{value}</span>
    </div>
  );
}
