// Kalshi WebSocket Client
// Real-time market updates using Kalshi's WebSocket API
// Documentation: https://trading-api.readme.io/reference/introduction

import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import { EventEmitter } from 'events';

// WebSocket message types
export interface KalshiTickerUpdate {
  type: 'ticker';
  msg: {
    market_ticker: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    last_price: number;
    volume: number;
    volume_24h: number;
    open_interest: number;
  };
}

export interface KalshiOrderbookUpdate {
  type: 'orderbook_snapshot' | 'orderbook_delta';
  msg: {
    market_ticker: string;
    yes: Array<[number, number]>; // [price, quantity]
    no: Array<[number, number]>;
  };
}

export interface KalshiFillUpdate {
  type: 'fill';
  msg: {
    trade_id: string;
    ticker: string;
    side: 'yes' | 'no';
    action: 'buy' | 'sell';
    count: number;
    yes_price: number;
    no_price: number;
    created_time: string;
  };
}

export type KalshiWebSocketMessage = KalshiTickerUpdate | KalshiOrderbookUpdate | KalshiFillUpdate;

// Subscription channels
type SubscriptionChannel = 'ticker' | 'orderbook_delta' | 'fill';

interface Subscription {
  channel: SubscriptionChannel;
  market_tickers?: string[];
}

export class KalshiWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKeyId: string;
  private privateKeyPath: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions: Subscription[] = [];
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(apiKeyId: string, privateKeyPath: string) {
    super();
    this.apiKeyId = apiKeyId;
    this.privateKeyPath = privateKeyPath.replace('~', process.env.HOME || '');
  }

  /**
   * Generate authentication signature for WebSocket connection
   */
  private generateAuthSignature(): { timestamp: string; signature: string } | null {
    try {
      if (!fs.existsSync(this.privateKeyPath)) {
        console.error(`Private key not found at: ${this.privateKeyPath}`);
        return null;
      }

      const privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // WebSocket auth uses a different message format
      const method = 'GET';
      const path = '/trade-api/ws/v2';
      const message = `${timestamp}${method}${path}`;

      const sign = crypto.createSign('RSA-SHA256');
      sign.update(message);
      sign.end();

      const signature = sign.sign(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        },
        'base64'
      );

      return { timestamp, signature };
    } catch (error) {
      console.error('Error generating WebSocket auth signature:', error);
      return null;
    }
  }

  /**
   * Connect to Kalshi WebSocket API
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Kalshi WebSocket endpoint
      const wsUrl = 'wss://api.elections.kalshi.com/trade-api/ws/v2';

      // Generate auth headers
      const auth = this.generateAuthSignature();
      if (!auth && this.apiKeyId) {
        reject(new Error('Failed to generate authentication signature'));
        return;
      }

      const headers: Record<string, string> = {};
      if (auth && this.apiKeyId) {
        headers['KALSHI-ACCESS-KEY'] = this.apiKeyId;
        headers['KALSHI-ACCESS-SIGNATURE'] = auth.signature;
        headers['KALSHI-ACCESS-TIMESTAMP'] = auth.timestamp;
      }

      this.ws = new WebSocket(wsUrl, { headers });

      this.ws.on('open', () => {
        console.log('Kalshi WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Start ping interval to keep connection alive
        this.startPingInterval();

        // Resubscribe to previous subscriptions
        this.resubscribe();

        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Kalshi WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.stopPingInterval();
        this.emit('disconnected', { code, reason: reason.toString() });

        // Attempt reconnection
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('Kalshi WebSocket error:', error);
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    // Handle different message types
    if (message.type === 'ticker') {
      this.emit('ticker', message.msg);
    } else if (message.type === 'orderbook_snapshot' || message.type === 'orderbook_delta') {
      this.emit('orderbook', message);
    } else if (message.type === 'fill') {
      this.emit('fill', message.msg);
    } else if (message.type === 'subscribed') {
      console.log('Subscription confirmed:', message);
      this.emit('subscribed', message);
    } else if (message.type === 'error') {
      console.error('WebSocket error message:', message);
      this.emit('ws_error', message);
    } else if (message.type === 'pong') {
      // Heartbeat response
    } else {
      console.log('Unknown WebSocket message:', message);
      this.emit('message', message);
    }
  }

  /**
   * Subscribe to ticker updates for specific markets
   */
  subscribeTicker(marketTickers: string[]): void {
    if (!this.ws || !this.isConnected) {
      console.warn('WebSocket not connected, queuing subscription');
      this.subscriptions.push({ channel: 'ticker', market_tickers: marketTickers });
      return;
    }

    const message = {
      id: Date.now(),
      cmd: 'subscribe',
      params: {
        channels: ['ticker'],
        market_tickers: marketTickers,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.push({ channel: 'ticker', market_tickers: marketTickers });
    console.log(`Subscribed to ticker for ${marketTickers.length} markets`);
  }

  /**
   * Subscribe to orderbook updates for specific markets
   */
  subscribeOrderbook(marketTickers: string[]): void {
    if (!this.ws || !this.isConnected) {
      console.warn('WebSocket not connected, queuing subscription');
      this.subscriptions.push({ channel: 'orderbook_delta', market_tickers: marketTickers });
      return;
    }

    const message = {
      id: Date.now(),
      cmd: 'subscribe',
      params: {
        channels: ['orderbook_delta'],
        market_tickers: marketTickers,
      },
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.push({ channel: 'orderbook_delta', market_tickers: marketTickers });
    console.log(`Subscribed to orderbook for ${marketTickers.length} markets`);
  }

  /**
   * Subscribe to fill updates (user's own trades)
   */
  subscribeFills(): void {
    if (!this.ws || !this.isConnected) {
      console.warn('WebSocket not connected, queuing subscription');
      this.subscriptions.push({ channel: 'fill' });
      return;
    }

    const message = {
      id: Date.now(),
      cmd: 'subscribe',
      params: {
        channels: ['fill'],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.push({ channel: 'fill' });
    console.log('Subscribed to fill updates');
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: SubscriptionChannel, marketTickers?: string[]): void {
    if (!this.ws || !this.isConnected) return;

    const message: any = {
      id: Date.now(),
      cmd: 'unsubscribe',
      params: {
        channels: [channel],
      },
    };

    if (marketTickers) {
      message.params.market_tickers = marketTickers;
    }

    this.ws.send(JSON.stringify(message));

    // Remove from subscriptions list
    this.subscriptions = this.subscriptions.filter(
      (sub) => !(sub.channel === channel &&
        JSON.stringify(sub.market_tickers) === JSON.stringify(marketTickers))
    );
  }

  /**
   * Resubscribe to all previous subscriptions after reconnection
   */
  private resubscribe(): void {
    const subs = [...this.subscriptions];
    this.subscriptions = [];

    for (const sub of subs) {
      if (sub.channel === 'ticker' && sub.market_tickers) {
        this.subscribeTicker(sub.market_tickers);
      } else if (sub.channel === 'orderbook_delta' && sub.market_tickers) {
        this.subscribeOrderbook(sub.market_tickers);
      } else if (sub.channel === 'fill') {
        this.subscribeFills();
      }
    }
  }

  /**
   * Start ping interval for keepalive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.ws.send(JSON.stringify({ id: Date.now(), cmd: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Close the WebSocket connection
   */
  disconnect(): void {
    this.stopPingInterval();
    this.subscriptions = [];

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance for the server
let wsClient: KalshiWebSocketClient | null = null;

export function getKalshiWebSocketClient(): KalshiWebSocketClient | null {
  if (!wsClient) {
    const apiKeyId = process.env.KALSHI_API_KEY_ID || '';
    const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH || '';

    if (!apiKeyId || !privateKeyPath) {
      console.warn('Kalshi API credentials not configured for WebSocket');
      return null;
    }

    wsClient = new KalshiWebSocketClient(apiKeyId, privateKeyPath);
  }

  return wsClient;
}
