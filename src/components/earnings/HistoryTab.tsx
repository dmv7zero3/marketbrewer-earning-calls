// History Tab Component
// Display quarterly performance and bet history

import { type BetRecord, type QuarterlyAnalysis } from '@/lib/api/data';

interface HistoryTabProps {
  companyName: string;
  quarterlyAnalysis: QuarterlyAnalysis[];
  betHistory: BetRecord[];
}

export function HistoryTab({
  companyName,
  quarterlyAnalysis,
  betHistory,
}: HistoryTabProps) {
  return (
    <div className="space-y-6">
      {/* Quarterly Analysis */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Quarterly Performance
        </h2>
        {quarterlyAnalysis.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No historical data yet. Add transcripts and place bets to see analysis.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-2 px-3">Quarter</th>
                  <th className="text-right py-2 px-3">Word Count</th>
                  <th className="text-right py-2 px-3">Bets</th>
                  <th className="text-right py-2 px-3">W/L</th>
                  <th className="text-right py-2 px-3">P&L</th>
                </tr>
              </thead>
              <tbody>
                {quarterlyAnalysis.map((q) => (
                  <tr
                    key={`${q.quarter}-${q.year}`}
                    className="border-b border-slate-800/50"
                  >
                    <td className="py-2 px-3 text-white font-medium">
                      {q.quarter} {q.year}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {q.wordCount.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {q.betsPlaced}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-profit-500">{q.betsWon}W</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-loss-500">{q.betsLost}L</span>
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono ${
                        q.totalPnl >= 0 ? 'text-profit-500' : 'text-loss-500'
                      }`}
                    >
                      {q.totalPnl >= 0 ? '+' : ''}${(q.totalPnl / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bet History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Bet History ({betHistory.length})
        </h2>
        {betHistory.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No bets placed yet for {companyName}.
          </p>
        ) : (
          <div className="space-y-2">
            {betHistory.map((bet) => (
              <BetHistoryCard key={bet.betId} bet={bet} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bet history card component
interface BetHistoryCardProps {
  bet: BetRecord;
}

function BetHistoryCard({ bet }: BetHistoryCardProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-between">
      <div>
        <p className="text-white font-medium">"{bet.word}"</p>
        <p className="text-xs text-slate-500">
          {bet.side.toUpperCase()} × {bet.count} @ {bet.price}¢
        </p>
      </div>
      <div className="text-right">
        <span
          className={`px-2 py-0.5 text-xs rounded ${
            bet.status === 'filled'
              ? 'bg-profit-500/20 text-profit-400'
              : bet.status === 'pending'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-slate-700 text-slate-400'
          }`}
        >
          {bet.status}
        </span>
        {bet.result && (
          <p
            className={`text-xs mt-1 ${
              bet.result === 'win' ? 'text-profit-500' : 'text-loss-500'
            }`}
          >
            {bet.result === 'win' ? '+' : ''}
            {((bet.pnl || 0) / 100).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
