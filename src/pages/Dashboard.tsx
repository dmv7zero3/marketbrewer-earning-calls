import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getBalance,
  getPositions,
  type KalshiBalance,
  type KalshiPosition,
} from '@/lib/api/kalshi';
import { getAllEarningsEvents, type EarningsEvent } from '@/lib/api/data';

function Dashboard() {
  const [balance, setBalance] = useState<KalshiBalance | null>(null);
  const [positions, setPositions] = useState<KalshiPosition[]>([]);
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'company' | 'volume' | 'markets'>('date');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch all data in parallel
        const [balanceData, positionsData, eventsData] = await Promise.all([
          getBalance().catch(() => null),
          getPositions().catch(() => []),
          getAllEarningsEvents().catch(() => []),
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

  // Filter to only show events where betting is still open
  // Exclude: closed, settled status OR past closeTime (market closed)
  const now = new Date();

  // Helper: Check if an event has any open markets for betting
  // Kalshi market statuses: initialized, inactive, active, closed, determined, disputed, amended, finalized
  // Only 'active' status means betting is still open
  // Note: Our DB also has 'open' from legacy data which we treat as active
  const hasOpenMarkets = (event: EarningsEvent): boolean => {
    if (!event.markets || event.markets.length === 0) return false;
    // Check if at least one market is still active (open for betting)
    // Accept both 'active' (Kalshi) and 'open' (our legacy default)
    return event.markets.some(m => m.status === 'active' || m.status === 'open');
  };

  const bettableEvents = events.filter((event) => {
    // Exclude closed or settled events
    if (event.status === 'closed' || event.status === 'settled') {
      return false;
    }
    // Exclude events where no markets are open for betting
    if (!hasOpenMarkets(event)) {
      return false;
    }
    return true;
  });

  // Filter events by search query
  const filteredEvents = bettableEvents.filter(
    (event) =>
      event.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper: Get the best available date for an event (eventDate if verified, else closeTime)
  const getEventDate = (event: EarningsEvent): Date | null => {
    if (event.eventDate && event.eventDateVerified) {
      return new Date(event.eventDate);
    }
    if (event.closeTime) {
      return new Date(event.closeTime);
    }
    return null;
  };

  // Sort events based on selected sort option
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        // Nearest earnings call date first (use eventDate if verified, else closeTime)
        const dateA = getEventDate(a)?.getTime() ?? Infinity;
        const dateB = getEventDate(b)?.getTime() ?? Infinity;
        return dateA - dateB;
      case 'company':
        // Alphabetical by company name
        return a.company.localeCompare(b.company);
      case 'volume':
        // Highest volume first
        return (b.totalVolume || 0) - (a.totalVolume || 0);
      case 'markets':
        // Most markets first
        return (b.marketCount || 0) - (a.marketCount || 0);
      default:
        return 0;
    }
  });

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
            Make sure the proxy server is running:{' '}
            <code className="bg-slate-800 px-1 rounded">bun run server</code>
          </p>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
        <div className="card">
          <p className="text-slate-400 text-sm mb-1">Open Markets</p>
          {loading ? (
            <div className="h-8 w-16 bg-slate-800 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">{bettableEvents.length}</p>
          )}
        </div>
      </div>

      {/* Earnings Events List */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-white">Earnings Call Events</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-slate-600"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'company' | 'volume' | 'markets')}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-slate-600 cursor-pointer"
            >
              <option value="date">Nearest Earnings</option>
              <option value="company">Company A-Z</option>
              <option value="volume">Highest Volume</option>
              <option value="markets">Most Markets</option>
            </select>
            <span className="text-sm text-slate-500 whitespace-nowrap">
              {filteredEvents.length} of {bettableEvents.length} open
            </span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-6 w-32 bg-slate-800 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-800 rounded mb-4" />
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-slate-800 rounded" />
                  <div className="h-6 w-16 bg-slate-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-400 mb-2">
              {searchQuery ? 'No matching events found' : 'No earnings call events found'}
            </p>
            <p className="text-slate-500 text-sm">
              {searchQuery
                ? 'Try a different search term'
                : 'Events will appear here when available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedEvents.map((event) => (
              <Link
                key={event.eventTicker}
                to={`/earnings/${encodeURIComponent(event.company)}/${encodeURIComponent(event.eventTicker)}`}
                className="card block hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-lg font-bold text-white">{event.company}</span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      event.status === 'active'
                        ? 'bg-profit-500/20 text-profit-400'
                        : event.status === 'upcoming'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
                {/* Earnings Call Date - Primary */}
                {event.eventDate && event.eventDateVerified ? (
                  <p className="text-sm font-medium text-white mb-1">
                    Earnings Call:{' '}
                    {new Date(event.eventDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-yellow-500 mb-1">
                    Earnings Date: TBD
                  </p>
                )}
                {/* Betting Closes - Secondary */}
                {event.closeTime && (
                  <p className="text-xs text-slate-500 mb-2">
                    Betting closes:{' '}
                    {new Date(event.closeTime).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {event.marketCount > 0
                      ? `${event.marketCount} word bets`
                      : 'No word bets yet'}
                  </span>
                  {event.totalVolume > 0 && (
                    <span className="font-mono text-slate-400">
                      ${event.totalVolume.toLocaleString()} vol
                    </span>
                  )}
                </div>
              </Link>
            ))}
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
                <div key={pos.ticker} className="py-3 flex items-center justify-between">
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
                      {pos.realized_pnl >= 0 ? '+' : ''}$
                      {(pos.realized_pnl / 100).toFixed(2)}
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
