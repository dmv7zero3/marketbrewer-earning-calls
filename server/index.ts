import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Kalshi API configuration
const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID || '';
const KALSHI_PRIVATE_KEY_PATH = process.env.KALSHI_PRIVATE_KEY_PATH || '';

app.use(cors());
app.use(express.json());

/**
 * Generate RSA-PSS signature for Kalshi API authentication
 */
function signRequest(
  method: string,
  path: string,
  timestamp: string
): string | null {
  try {
    const privateKeyPath = KALSHI_PRIVATE_KEY_PATH.replace('~', process.env.HOME || '');

    if (!fs.existsSync(privateKeyPath)) {
      console.error(`Private key not found at: ${privateKeyPath}`);
      return null;
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
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

    return signature;
  } catch (error) {
    console.error('Error signing request:', error);
    return null;
  }
}

/**
 * Make authenticated request to Kalshi API
 */
async function kalshiRequest(
  method: string,
  endpoint: string,
  body?: object
): Promise<{ status: number; data: unknown }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `/trade-api/v2${endpoint}`;
  const signature = signRequest(method, path, timestamp);

  if (!signature && KALSHI_API_KEY_ID) {
    return { status: 500, data: { error: 'Failed to sign request' } };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Only add auth headers if credentials are configured
  if (KALSHI_API_KEY_ID && signature) {
    headers['KALSHI-ACCESS-KEY'] = KALSHI_API_KEY_ID;
    headers['KALSHI-ACCESS-SIGNATURE'] = signature;
    headers['KALSHI-ACCESS-TIMESTAMP'] = timestamp;
  }

  try {
    const response = await fetch(`${KALSHI_API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error('Kalshi API error:', error);
    return { status: 500, data: { error: 'Failed to fetch from Kalshi API' } };
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Exchange status
app.get('/api/kalshi/exchange/status', async (req, res) => {
  const result = await kalshiRequest('GET', '/exchange/status');
  res.status(result.status).json(result.data);
});

// Portfolio balance
app.get('/api/kalshi/portfolio/balance', async (req, res) => {
  const result = await kalshiRequest('GET', '/portfolio/balance');
  res.status(result.status).json(result.data);
});

// Portfolio positions
app.get('/api/kalshi/portfolio/positions', async (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const endpoint = queryString ? `/portfolio/positions?${queryString}` : '/portfolio/positions';
  const result = await kalshiRequest('GET', endpoint);
  res.status(result.status).json(result.data);
});

// Portfolio fills (trade history)
app.get('/api/kalshi/portfolio/fills', async (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const endpoint = queryString ? `/portfolio/fills?${queryString}` : '/portfolio/fills';
  const result = await kalshiRequest('GET', endpoint);
  res.status(result.status).json(result.data);
});

// List markets
app.get('/api/kalshi/markets', async (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const endpoint = queryString ? `/markets?${queryString}` : '/markets';
  const result = await kalshiRequest('GET', endpoint);
  res.status(result.status).json(result.data);
});

// Get single market
app.get('/api/kalshi/markets/:ticker', async (req, res) => {
  const result = await kalshiRequest('GET', `/markets/${req.params.ticker}`);
  res.status(result.status).json(result.data);
});

// Place order
app.post('/api/kalshi/portfolio/orders', async (req, res) => {
  const result = await kalshiRequest('POST', '/portfolio/orders', req.body);
  res.status(result.status).json(result.data);
});

// Get orders
app.get('/api/kalshi/portfolio/orders', async (req, res) => {
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const endpoint = queryString ? `/portfolio/orders?${queryString}` : '/portfolio/orders';
  const result = await kalshiRequest('GET', endpoint);
  res.status(result.status).json(result.data);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Kalshi API Key ID: ${KALSHI_API_KEY_ID ? 'Configured' : 'Not configured'}`);
  console.log(`Private Key Path: ${KALSHI_PRIVATE_KEY_PATH || 'Not configured'}`);
});
