// DynamoDB Client - Single Table Design (No GSIs)
// Table: marketbrewer-earnings-call
// Billing: PAY_PER_REQUEST (cost optimized)

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'marketbrewer-earnings-call';

// Entity Types
export interface Transcript {
  PK: string; // TRANSCRIPT#{eventTicker}
  SK: string; // DATE#{date}
  eventTicker: string;
  company: string;
  date: string;
  quarter: string; // Q1, Q2, Q3, Q4
  year: number;
  content: string;
  wordCount: number;
  createdAt: string;
  expiresAt?: number; // TTL (optional)

  // Source metadata (for verification)
  sourceUrl?: string; // Original URL (e.g., Seeking Alpha)
  sourceTitle?: string; // Title from source page
  sourceDate?: string; // Date string from source page
  sourceTicker?: string; // Ticker symbol from source
  sourceDomain?: string; // Domain of source URL

  // Content fingerprints
  contentHash?: string; // SHA-256 of transcript content
  rawHtmlHash?: string; // SHA-256 of raw HTML (if available)

  // Verification fields
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  verifiedBy?: string; // 'user' or 'auto'
  verificationNotes?: string;

  // Validation summary
  validationDecision?: 'approve' | 'review' | 'reject';
  validationConfidence?: number; // 0-100
  validationReasons?: string[];
  auditId?: string; // Audit log entry ID

  // Parsed/normalized data for comparison
  parsedCompany?: string; // Company name extracted from source
  parsedQuarter?: string; // Quarter extracted from source (e.g., "Q4 2025")
  parsedEarningsDate?: string; // Actual earnings call date from source
}

export interface ResearchNote {
  PK: string; // NOTE#{eventTicker}
  SK: string; // TIMESTAMP#{timestamp}
  eventTicker: string;
  company: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BetRecord {
  PK: string; // BET#{betId}
  SK: string; // METADATA
  betId: string;
  eventTicker: string;
  marketTicker: string;
  company: string;
  word: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  orderId?: string;
  createdAt: string;
  settledAt?: string;
  result?: 'win' | 'loss' | 'void';
  pnl?: number;
}

export interface NewsCache {
  PK: string; // NEWSCACHE#{word}
  SK: string; // DATE#{date}
  word: string;
  articleCount: number;
  articles: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string;
  }>;
  fetchedAt: string;
  expiresAt: number; // TTL - 6 hours
}

export interface EarningsEvent {
  PK: string; // EARNINGS#{company}
  SK: string; // EVENT#{eventTicker}
  eventTicker: string;
  seriesTicker?: string;
  company: string;
  stockTicker?: string; // Stock market ticker (e.g., AAPL, GOOGL)
  title: string;
  category: string;
  status: 'upcoming' | 'active' | 'closed' | 'settled';
  eventDate?: string;
  eventDateSource?: 'transcript' | 'manual' | 'kalshi';
  eventDateVerified?: boolean;
  eventDateConfidence?: number; // 0-100
  eventDateUpdatedAt?: string;
  closeTime?: string;
  seekingAlphaUrl?: string; // URL to Seeking Alpha earnings transcripts page
  markets: Array<{
    ticker: string;
    word: string;
    yesPrice: number;
    noPrice: number;
    lastPrice: number;
    volume: number;
    status: string;
  }>;
  totalVolume: number;
  marketCount: number;
  createdAt: string;
  updatedAt: string;
}

// Transcript Functions
export async function saveTranscript(
  transcript: Omit<Transcript, 'PK' | 'SK' | 'createdAt'>
) {
  const item: Transcript = {
    PK: `TRANSCRIPT#${transcript.eventTicker}`,
    SK: `DATE#${transcript.date}`,
    ...transcript,
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

export async function getTranscript(
  eventTicker: string,
  date: string
): Promise<Transcript | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRANSCRIPT#${eventTicker}`,
        SK: `DATE#${date}`,
      },
    })
  );

  return (result.Item as Transcript) || null;
}

export async function getTranscriptsForEvent(eventTicker: string): Promise<Transcript[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `TRANSCRIPT#${eventTicker}`,
      },
    })
  );

  return (result.Items as Transcript[]) || [];
}

export async function getAllTranscripts(): Promise<Transcript[]> {
  // Scan with filter - no GSI (cost optimized per user requirement)
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': 'TRANSCRIPT#',
      },
    })
  );

  return (result.Items as Transcript[]) || [];
}

export async function updateTranscriptVerification(
  eventTicker: string,
  date: string,
  status: Transcript['verificationStatus'],
  notes?: string
): Promise<void> {
  const updateExpr = notes
    ? 'SET verificationStatus = :status, verifiedAt = :verifiedAt, verifiedBy = :verifiedBy, verificationNotes = :notes'
    : 'SET verificationStatus = :status, verifiedAt = :verifiedAt, verifiedBy = :verifiedBy';

  const exprValues: Record<string, unknown> = {
    ':status': status,
    ':verifiedAt': new Date().toISOString(),
    ':verifiedBy': 'user',
  };

  if (notes) {
    exprValues[':notes'] = notes;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `TRANSCRIPT#${eventTicker}`,
        SK: `DATE#${date}`,
      },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: exprValues,
    })
  );
}

export async function getPendingTranscripts(): Promise<Transcript[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix) AND verificationStatus = :status',
      ExpressionAttributeValues: {
        ':prefix': 'TRANSCRIPT#',
        ':status': 'pending',
      },
    })
  );

  return (result.Items as Transcript[]) || [];
}

// Research Note Functions
export async function saveNote(
  note: Omit<ResearchNote, 'PK' | 'SK' | 'createdAt' | 'updatedAt'>
) {
  const timestamp = Date.now();
  const item: ResearchNote = {
    PK: `NOTE#${note.eventTicker}`,
    SK: `TIMESTAMP#${timestamp}`,
    ...note,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

export async function getNotesForEvent(eventTicker: string): Promise<ResearchNote[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `NOTE#${eventTicker}`,
      },
      ScanIndexForward: false, // Newest first
    })
  );

  return (result.Items as ResearchNote[]) || [];
}

export async function deleteNote(eventTicker: string, timestamp: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `NOTE#${eventTicker}`,
        SK: `TIMESTAMP#${timestamp}`,
      },
    })
  );
}

// Bet Record Functions
export async function saveBet(bet: Omit<BetRecord, 'PK' | 'SK' | 'createdAt'>) {
  const item: BetRecord = {
    PK: `BET#${bet.betId}`,
    SK: 'METADATA',
    ...bet,
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

export async function getBet(betId: string): Promise<BetRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `BET#${betId}`,
        SK: 'METADATA',
      },
    })
  );

  return (result.Item as BetRecord) || null;
}

export async function updateBetStatus(
  betId: string,
  status: BetRecord['status'],
  orderId?: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `BET#${betId}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'SET #status = :status, orderId = :orderId',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':orderId': orderId || null,
      },
    })
  );
}

export async function getAllBets(status?: BetRecord['status']): Promise<BetRecord[]> {
  // Scan with filter - no GSI (cost optimized)
  const params: any = {
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :prefix)',
    ExpressionAttributeValues: {
      ':prefix': 'BET#',
    },
  };

  if (status) {
    params.FilterExpression += ' AND #status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues[':status'] = status;
  }

  const result = await docClient.send(new ScanCommand(params));
  return (result.Items as BetRecord[]) || [];
}

// News Cache Functions
export async function cacheNewsResults(word: string, articles: NewsCache['articles']) {
  const sixHoursFromNow = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
  const date = new Date().toISOString().split('T')[0];

  const item: NewsCache = {
    PK: `NEWSCACHE#${word.toLowerCase()}`,
    SK: `DATE#${date}`,
    word: word.toLowerCase(),
    articleCount: articles.length,
    articles,
    fetchedAt: new Date().toISOString(),
    expiresAt: sixHoursFromNow,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

export async function getCachedNews(word: string): Promise<NewsCache | null> {
  const date = new Date().toISOString().split('T')[0];

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `NEWSCACHE#${word.toLowerCase()}`,
        SK: `DATE#${date}`,
      },
    })
  );

  // Check if cache is still valid (not expired)
  if (result.Item) {
    const item = result.Item as NewsCache;
    const now = Math.floor(Date.now() / 1000);
    if (item.expiresAt > now) {
      return item;
    }
  }

  return null;
}

// Earnings Event Functions
export async function saveEarningsEvent(
  event: Omit<EarningsEvent, 'PK' | 'SK' | 'createdAt' | 'updatedAt'>
): Promise<EarningsEvent> {
  const now = new Date().toISOString();
  const item: EarningsEvent = {
    PK: `EARNINGS#${event.company.toUpperCase()}`,
    SK: `EVENT#${event.eventTicker}`,
    ...event,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );

  return item;
}

export async function getEarningsEvent(
  company: string,
  eventTicker: string
): Promise<EarningsEvent | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EARNINGS#${company.toUpperCase()}`,
        SK: `EVENT#${eventTicker}`,
      },
    })
  );

  return (result.Item as EarningsEvent) || null;
}

export async function getEarningsEventsForCompany(
  company: string
): Promise<EarningsEvent[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `EARNINGS#${company.toUpperCase()}`,
      },
      ScanIndexForward: false, // Newest first
    })
  );

  return (result.Items as EarningsEvent[]) || [];
}

export async function getAllEarningsEvents(
  status?: EarningsEvent['status']
): Promise<EarningsEvent[]> {
  const params: any = {
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(PK, :prefix)',
    ExpressionAttributeValues: {
      ':prefix': 'EARNINGS#',
    },
  };

  if (status) {
    params.FilterExpression += ' AND #status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues[':status'] = status;
  }

  const result = await docClient.send(new ScanCommand(params));
  return (result.Items as EarningsEvent[]) || [];
}

export async function updateEarningsEventMarkets(
  company: string,
  eventTicker: string,
  markets: EarningsEvent['markets'],
  totalVolume: number
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EARNINGS#${company.toUpperCase()}`,
        SK: `EVENT#${eventTicker}`,
      },
      UpdateExpression:
        'SET markets = :markets, totalVolume = :volume, marketCount = :count, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':markets': markets,
        ':volume': totalVolume,
        ':count': markets.length,
        ':updatedAt': new Date().toISOString(),
      },
    })
  );
}

export async function updateEarningsEventDate(
  company: string,
  eventTicker: string,
  params: {
    eventDate: string;
    source: 'transcript' | 'manual' | 'kalshi';
    verified: boolean;
    confidence?: number;
  }
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EARNINGS#${company.toUpperCase()}`,
        SK: `EVENT#${eventTicker}`,
      },
      UpdateExpression:
        'SET eventDate = :eventDate, eventDateSource = :source, eventDateVerified = :verified, eventDateConfidence = :confidence, eventDateUpdatedAt = :updatedAt, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':eventDate': params.eventDate,
        ':source': params.source,
        ':verified': params.verified,
        ':confidence': params.confidence ?? null,
        ':updatedAt': new Date().toISOString(),
      },
    })
  );
}

export async function deleteEarningsEvent(
  company: string,
  eventTicker: string
): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EARNINGS#${company.toUpperCase()}`,
        SK: `EVENT#${eventTicker}`,
      },
    })
  );
}
