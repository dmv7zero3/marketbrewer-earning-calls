// Bet Form Component
// Sidebar form for placing bets on word mentions

import { useState } from 'react';
import { placeOrder, type KalshiOrderRequest } from '@/lib/api/kalshi';
import { saveBet } from '@/lib/api/data';
import { type WordBet } from '@/hooks/useEarningsData';
import { calculateBet } from '@/lib/utils/wordAnalysis';

interface BetFormProps {
  selectedBet: WordBet | null;
  eventTicker: string;
  companyName: string;
  initialSide?: 'yes' | 'no';
  onOrderPlaced: () => void;
}

export function BetForm({
  selectedBet,
  eventTicker,
  companyName,
  initialSide = 'yes',
  onOrderPlaced,
}: BetFormProps) {
  const [betSide, setBetSide] = useState<'yes' | 'no'>(initialSide);
  const [betContracts, setBetContracts] = useState(10);
  const [betPrice, setBetPrice] = useState(
    selectedBet ? (initialSide === 'yes' ? selectedBet.yesPrice : selectedBet.noPrice) : 50
  );
  const [placingOrder, setPlacingOrder] = useState(false);

  // Update price when side or selected bet changes
  const handleSideChange = (side: 'yes' | 'no') => {
    setBetSide(side);
    if (selectedBet) {
      setBetPrice(side === 'yes' ? selectedBet.yesPrice : selectedBet.noPrice);
    }
  };

  // Calculate bet cost and payout
  const { cost: betCost, payout: betPayout } = calculateBet(betContracts, betPrice);

  // Handle placing order
  const handlePlaceOrder = async () => {
    if (!selectedBet) return;

    setPlacingOrder(true);
    try {
      const clientOrderId = `order-${Date.now()}`;
      const order: KalshiOrderRequest = {
        ticker: selectedBet.ticker,
        client_order_id: clientOrderId,
        type: 'limit',
        action: 'buy',
        side: betSide,
        count: betContracts,
        yes_price: betSide === 'yes' ? betPrice : undefined,
        no_price: betSide === 'no' ? betPrice : undefined,
      };

      await placeOrder(order);

      // Save bet to DynamoDB for historical tracking
      await saveBet({
        betId: clientOrderId,
        eventTicker,
        marketTicker: selectedBet.ticker,
        company: companyName,
        word: selectedBet.word,
        side: betSide,
        action: 'buy',
        count: betContracts,
        price: betPrice,
      });

      alert(`Order placed: ${betContracts} ${betSide.toUpperCase()} @ ${betPrice}¢`);
      onOrderPlaced();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!selectedBet) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Select a Word</h2>
        <p className="text-slate-500 text-sm">
          Click on a word in the list to place a bet.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-white mb-4">
        Bet: "{selectedBet.word}"
      </h2>

      <div className="space-y-4">
        {/* Word Analysis Summary */}
        {(selectedBet.transcriptCount > 0 || selectedBet.trending) && (
          <div className="p-3 bg-slate-800 rounded-lg text-xs">
            {selectedBet.transcriptCount > 0 && (
              <p className="text-profit-400 mb-1">
                Found {selectedBet.transcriptCount}x in past transcripts
              </p>
            )}
            {selectedBet.trending && (
              <p className="text-yellow-400">
                Trending in news ({selectedBet.newsCount} articles)
              </p>
            )}
          </div>
        )}

        {/* Side Selection */}
        <div>
          <label className="text-sm text-slate-400 block mb-2">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSideChange('yes')}
              className={`py-2 rounded font-medium transition-colors ${
                betSide === 'yes'
                  ? 'bg-profit-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              YES {selectedBet.yesPrice}¢
            </button>
            <button
              onClick={() => handleSideChange('no')}
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

        {/* Contracts Input */}
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

        {/* Price Input */}
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

        {/* Place Order Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={placingOrder}
          className="btn-primary w-full disabled:opacity-50"
        >
          {placingOrder ? 'Placing Order...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}
