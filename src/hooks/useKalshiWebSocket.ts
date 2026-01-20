// React hook for Kalshi WebSocket real-time updates
// Connects to the server's WebSocket proxy for market data

import { useState, useEffect, useCallback, useRef } from 'react';

// Ticker update from Kalshi WebSocket
export interface TickerUpdate {
  market_ticker: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
}

// Fill update (user's own trades)
export interface FillUpdate {
  trade_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  yes_price: number;
  no_price: number;
  created_time: string;
}

interface UseKalshiWebSocketOptions {
  // Auto-connect on mount
  autoConnect?: boolean;
  // Reconnect on disconnect
  autoReconnect?: boolean;
  // Max reconnect attempts
  maxReconnectAttempts?: number;
}

interface UseKalshiWebSocketResult {
  // Connection state
  isConnected: boolean;
  isKalshiConnected: boolean;

  // Latest updates (by market ticker)
  tickerUpdates: Map<string, TickerUpdate>;

  // Methods
  connect: () => void;
  disconnect: () => void;
  subscribe: (marketTickers: string[]) => void;
  unsubscribe: (marketTickers: string[]) => void;

  // Callbacks for real-time events
  onTicker: (callback: (update: TickerUpdate) => void) => void;
  onFill: (callback: (update: FillUpdate) => void) => void;
}

export function useKalshiWebSocket(
  options: UseKalshiWebSocketOptions = {}
): UseKalshiWebSocketResult {
  const {
    autoConnect = true,
    autoReconnect = true,
    maxReconnectAttempts = 5,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isKalshiConnected, setIsKalshiConnected] = useState(false);
  const [tickerUpdates, setTickerUpdates] = useState<Map<string, TickerUpdate>>(
    new Map()
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Callback refs for real-time events
  const onTickerCallbackRef = useRef<((update: TickerUpdate) => void) | null>(null);
  const onFillCallbackRef = useRef<((update: FillUpdate) => void) | null>(null);

  // WebSocket URL (same host, /ws path)
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In development, use port 3001 (server port)
    const host = process.env.NODE_ENV === 'development'
      ? 'localhost:3001'
      : window.location.host;
    return `${protocol}//${host}/ws`;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const url = getWsUrl();
      console.log('Connecting to WebSocket:', url);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Start ping interval for keepalive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ cmd: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'status':
              setIsKalshiConnected(message.connected);
              break;

            case 'ticker':
              // Update ticker data
              setTickerUpdates((prev) => {
                const next = new Map(prev);
                next.set(message.data.market_ticker, message.data);
                return next;
              });
              // Call callback if registered
              if (onTickerCallbackRef.current) {
                onTickerCallbackRef.current(message.data);
              }
              break;

            case 'fill':
              // Call fill callback if registered
              if (onFillCallbackRef.current) {
                onFillCallbackRef.current(message.data);
              }
              break;

            case 'subscribed':
              console.log('Subscribed to markets:', message.market_tickers);
              break;

            case 'pong':
              // Keepalive response
              break;

            default:
              console.log('Unknown WebSocket message:', message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setIsKalshiConnected(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnection
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
    }
  }, [getWsUrl, autoReconnect, maxReconnectAttempts]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsKalshiConnected(false);
  }, []);

  // Subscribe to market tickers
  const subscribe = useCallback((marketTickers: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          cmd: 'subscribe',
          market_tickers: marketTickers,
        })
      );
    }
  }, []);

  // Unsubscribe from market tickers
  const unsubscribe = useCallback((marketTickers: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          cmd: 'unsubscribe',
          market_tickers: marketTickers,
        })
      );
    }
  }, []);

  // Register ticker callback
  const onTicker = useCallback((callback: (update: TickerUpdate) => void) => {
    onTickerCallbackRef.current = callback;
  }, []);

  // Register fill callback
  const onFill = useCallback((callback: (update: FillUpdate) => void) => {
    onFillCallbackRef.current = callback;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isKalshiConnected,
    tickerUpdates,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    onTicker,
    onFill,
  };
}
