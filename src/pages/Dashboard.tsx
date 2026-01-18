import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getBalance,
  getPositions,
  getEarningsCallEvents,
  type EarningsCallEvent,
  type KalshiBalance,
  type KalshiPosition,
} from '@/lib/api/kalshi';

function Dashboard() {
  const [balance, setBalance] = useState<KalshiBalance | null>(null);
  const [positions, setPositions] = useState<KalshiPosition[]>([]);
  const [events, setEvents] = useState<EarningsCallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch all data in parallel
        const [balanceData, positionsData, eventsData] = await Promise.all([
          getBalance().catch(() => null),
          getPositions().catch(() => []),
          getEarningsCallEvents().catch(() => []),
        ]);

        setBalance(balanceData);
        setPositions(positionsData);
        setEvents(eventsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Calculate P&L from positions
  const totalPnl = positions.reduce((sum, p) => sum + p.realized_pnl, 0);

  // Format date for display
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Earnings Call Bets</h1>
        <p className="text-slate-400">
          Track upcoming earnings calls and place MENTION bets on Kalshi
        </p>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-loss-500/10 border border-loss-500/30 rounded-lg">
          <p className="text-loss-400 text-sm">{error}</p>
          <p className="text-slate-500 text-xs mt-1">
            Make sure the proxy server is running: <code className="bg-slate-800 px-1 rounded">bun run server</code>
          </p>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-slate-400 text-sm mb-1">Portfolio Balance</p>
          {loading ? (
            <div className="h-8 w-24 bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">
              ${balance ? (balance.balance / 100).toFixed(2) : '0.00'}
            </p>
          )}
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm mb-1">Open Positions</p>
          {loading ? (
            <div className="h-8 w-16 bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">{positions.length}</p>
          )}
        </div>
        <div className="card">
          <p className="text-slate-400 text-sm mb-1">Realized P&L</p>
          {loading ? (
            <div className="h-8 w-20 bg-slate-800 rounded animate-pulse" />
          ) : (
            <p
              className={`text-2xl font-bold ${
                totalPnl >= 0 ? 'text-profit-500' : 'text-loss-500'
              }`}
            >
              {totalPnl >= 0 ? '+' : ''}${(totalPnl / 100).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Earnings Events List */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Upcoming Earnings Calls
          </h2>
          <span className="text-sm text-slate-500">
            {events.length} events found
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-6 w-32 bg-slate-800 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-800 rounded mb-4" />
                <div className="flex gap-2">
                  <div className="h-8 w-24 bg-slate-800 rounded" />
                  <div className="h-8 w-24 bg-slate-800 rounded" />
                  <div className="h-8 w-24 bg-slate-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400 mb-2">No earnings call events found</p>
            <p className="text-slate-500 text-sm">
              Check if the Kalshi API is connected and there are active earnings markets
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              // Get top 3 words by implied probability
              const topWords = event.markets
                .map((m) => ({
                  word: m.yes_sub_title || m.subtitle || m.ticker.split('-').pop() || '',
                  chance: Math.round((m.yes_bid || m.last_price) * 100),
                  yesPrice: Math.round((m.yes_bid || m.last_price) * 100),
                  volume: m.volume,
                }))
                .sort((a, b) => b.chance - a.chance)
                .slice(0, 3);

              return (
                <Link
                  key={event.eventTicker}
                  to={`/earnings/${encodeURIComponent(event.eventTicker)}`}
                  className="card block hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-lg font-bold text-white">
                          {event.company}
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-400 rounded">
                          {event.markets.length} words
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        {formatEventDate(event.eventDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Volume</p>
                      <p className="text-sm font-mono text-slate-300">
                        ${event.totalVolume.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Top Words Preview */}
                  <div className="flex flex-wrap gap-2">
                    {topWords.map((word, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg"
                      >
                        <span className="text-sm text-white">{word.word}</span>
                        <span className="text-xs font-mono text-profit-400">
                          {word.chance}%
                        </span>
                      </div>
                    ))}
                    {event.markets.length > 3 && (
                      <div className="px-3 py-1.5 text-xs text-slate-500">
                        +{event.markets.length - 3} more
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Open Positions Section */}
      {positions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">Your Positions</h2>
          <div className="card">
            <div className="divide-y divide-slate-800">
              {positions.map((pos) => (
                <div
                  key={pos.ticker}
                  className="py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-medium">{pos.ticker}</p>
                    <p className="text-sm text-slate-500">
                      {pos.position > 0 ? 'YES' : 'NO'} × {Math.abs(pos.position)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-mono ${
                        pos.realized_pnl >= 0 ? 'text-profit-500' : 'text-loss-500'
                      }`}
                    >
                      {pos.realized_pnl >= 0 ? '+' : ''}
                      ${(pos.realized_pnl / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Exposure: ${(pos.market_exposure / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default Dashboard;
