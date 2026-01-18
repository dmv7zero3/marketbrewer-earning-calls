import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Import DynamoDB and News modules
import {
  saveTranscript,
  getTranscript,
  getTranscriptsForEvent,
  getAllTranscripts,
  saveNote,
  getNotesForEvent,
  deleteNote,
  saveBet,
  getBet,
  updateBetStatus,
  getAllBets,
} from './lib/dynamodb';
import { fetchNewsForWord, fetchNewsForWords, getTrendingWords } from './lib/news';

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

// ===========================================
// Transcript Endpoints
// ===========================================

// Save a transcript
app.post('/api/transcripts', async (req, res) => {
  try {
    const { eventTicker, company, date, quarter, year, content } = req.body;

    if (!eventTicker || !company || !date || !quarter || !year || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;

    const transcript = await saveTranscript({
      eventTicker,
      company,
      date,
      quarter,
      year: parseInt(year),
      content,
      wordCount,
    });

    res.status(201).json(transcript);
  } catch (error) {
    console.error('Error saving transcript:', error);
    res.status(500).json({ error: 'Failed to save transcript' });
  }
});

// Get a specific transcript
app.get('/api/transcripts/:eventTicker/:date', async (req, res) => {
  try {
    const transcript = await getTranscript(req.params.eventTicker, req.params.date);
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    res.json(transcript);
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// Get all transcripts for an event (company)
app.get('/api/transcripts/:eventTicker', async (req, res) => {
  try {
    const transcripts = await getTranscriptsForEvent(req.params.eventTicker);
    res.json(transcripts);
  } catch (error) {
    console.error('Error getting transcripts:', error);
    res.status(500).json({ error: 'Failed to get transcripts' });
  }
});

// Get all transcripts
app.get('/api/transcripts', async (req, res) => {
  try {
    const transcripts = await getAllTranscripts();
    res.json(transcripts);
  } catch (error) {
    console.error('Error getting all transcripts:', error);
    res.status(500).json({ error: 'Failed to get transcripts' });
  }
});

// ===========================================
// Research Notes Endpoints
// ===========================================

// Save a research note
app.post('/api/notes', async (req, res) => {
  try {
    const { eventTicker, company, content, tags } = req.body;

    if (!eventTicker || !company || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const note = await saveNote({
      eventTicker,
      company,
      content,
      tags: tags || [],
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// Get notes for an event
app.get('/api/notes/:eventTicker', async (req, res) => {
  try {
    const notes = await getNotesForEvent(req.params.eventTicker);
    res.json(notes);
  } catch (error) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Delete a note
app.delete('/api/notes/:eventTicker/:timestamp', async (req, res) => {
  try {
    await deleteNote(req.params.eventTicker, req.params.timestamp);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ===========================================
// Bet History Endpoints
// ===========================================

// Save a bet record
app.post('/api/bets', async (req, res) => {
  try {
    const { betId, eventTicker, marketTicker, company, word, side, action, count, price } = req.body;

    if (!betId || !eventTicker || !marketTicker || !company || !word || !side || !action || !count || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const bet = await saveBet({
      betId,
      eventTicker,
      marketTicker,
      company,
      word,
      side,
      action,
      count: parseInt(count),
      price: parseFloat(price),
      status: 'pending',
    });

    res.status(201).json(bet);
  } catch (error) {
    console.error('Error saving bet:', error);
    res.status(500).json({ error: 'Failed to save bet' });
  }
});

// Get a specific bet
app.get('/api/bets/:betId', async (req, res) => {
  try {
    const bet = await getBet(req.params.betId);
    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    res.json(bet);
  } catch (error) {
    console.error('Error getting bet:', error);
    res.status(500).json({ error: 'Failed to get bet' });
  }
});

// Update bet status
app.patch('/api/bets/:betId', async (req, res) => {
  try {
    const { status, orderId } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    await updateBetStatus(req.params.betId, status, orderId);
    res.status(200).json({ message: 'Bet updated' });
  } catch (error) {
    console.error('Error updating bet:', error);
    res.status(500).json({ error: 'Failed to update bet' });
  }
});

// Get all bets (with optional status filter)
app.get('/api/bets', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const bets = await getAllBets(status as any);
    res.json(bets);
  } catch (error) {
    console.error('Error getting bets:', error);
    res.status(500).json({ error: 'Failed to get bets' });
  }
});

// ===========================================
// News Endpoints (Google News RSS)
// ===========================================

// Get news for a single word
app.get('/api/news/:word', async (req, res) => {
  try {
    const company = req.query.company as string | undefined;
    const result = await fetchNewsForWord(req.params.word, company);
    res.json(result);
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Get news for multiple words (batch)
app.post('/api/news/batch', async (req, res) => {
  try {
    const { words, company } = req.body;

    if (!words || !Array.isArray(words)) {
      return res.status(400).json({ error: 'Words array is required' });
    }

    const results = await fetchNewsForWords(words, company);
    res.json(Object.fromEntries(results));
  } catch (error) {
    console.error('Error fetching batch news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Get trending words from a list
app.post('/api/news/trending', async (req, res) => {
  try {
    const { words, company } = req.body;

    if (!words || !Array.isArray(words)) {
      return res.status(400).json({ error: 'Words array is required' });
    }

    const trending = await getTrendingWords(words, company);
    res.json({ trending });
  } catch (error) {
    console.error('Error getting trending words:', error);
    res.status(500).json({ error: 'Failed to get trending words' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Kalshi API Key ID: ${KALSHI_API_KEY_ID ? 'Configured' : 'Not configured'}`);
  console.log(`Private Key Path: ${KALSHI_PRIVATE_KEY_PATH || 'Not configured'}`);
  console.log(`DynamoDB Table: ${process.env.DYNAMODB_TABLE_NAME || 'marketbrewer-earnings-call'}`);
});
