# Web Scraping Plan: Seeking Alpha Earnings Transcripts

## Overview

This document outlines the plan for scraping earnings call transcripts from Seeking Alpha with a comprehensive accuracy audit system to ensure 100% data integrity.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WEB SCRAPING PIPELINE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Seeking    │    │   Scraper    │    │   Parser     │              │
│  │   Alpha      │───▶│   Service    │───▶│   Module     │              │
│  │   (Source)   │    │              │    │              │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                             │                   │                       │
│                             ▼                   ▼                       │
│                      ┌──────────────┐    ┌──────────────┐              │
│                      │   Raw HTML   │    │   Extracted  │              │
│                      │   Storage    │    │   Metadata   │              │
│                      └──────────────┘    └──────────────┘              │
│                             │                   │                       │
│                             └─────────┬─────────┘                       │
│                                       ▼                                 │
│                              ┌──────────────┐                          │
│                              │   ACCURACY   │                          │
│                              │    AUDIT     │                          │
│                              │   SYSTEM     │                          │
│                              └──────────────┘                          │
│                                       │                                 │
│                    ┌──────────────────┼──────────────────┐             │
│                    ▼                  ▼                  ▼             │
│             ┌──────────┐       ┌──────────┐       ┌──────────┐        │
│             │  Auto    │       │  Manual  │       │  Cross   │        │
│             │  Checks  │       │  Review  │       │  Verify  │        │
│             └──────────┘       └──────────┘       └──────────┘        │
│                    │                  │                  │             │
│                    └──────────────────┼──────────────────┘             │
│                                       ▼                                 │
│                              ┌──────────────┐                          │
│                              │   DynamoDB   │                          │
│                              │  (Verified   │                          │
│                              │   Storage)   │                          │
│                              └──────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Phase 1: Data Extraction

### 1.1 Target URL Structure
```
https://seekingalpha.com/symbol/{TICKER}/earnings/transcripts
```

Example URLs:
- https://seekingalpha.com/symbol/AAPL/earnings/transcripts
- https://seekingalpha.com/symbol/TSLA/earnings/transcripts
- https://seekingalpha.com/symbol/NVDA/earnings/transcripts

### 1.2 Data Points to Extract

| Field | Source Location | Validation Rule |
|-------|-----------------|-----------------|
| Company Name | Page header / Title | Must match known company |
| Stock Ticker | URL / Header | Must match expected ticker |
| Quarter | Transcript title | Format: Q1/Q2/Q3/Q4 |
| Fiscal Year | Transcript title | 4-digit year |
| Call Date | Transcript metadata | ISO date format |
| Call Time | Transcript metadata | Time with timezone |
| Transcript Content | Article body | Non-empty, word count > 1000 |
| Participants | Header section | CEO/CFO names present |
| Source URL | Current URL | Valid HTTPS URL |

### 1.3 Page Structure Analysis

```html
<!-- Expected Seeking Alpha structure (to be verified) -->
<article>
  <header>
    <h1>{Company} ({TICKER}) Q{N} {YEAR} Earnings Call Transcript</h1>
    <time datetime="...">{Call Date}</time>
  </header>

  <section class="participants">
    <!-- CEO, CFO, Analysts -->
  </section>

  <section class="transcript-body">
    <!-- Full transcript content -->
  </section>
</article>
```

## Phase 2: Accuracy Audit System

### 2.1 Audit Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCURACY AUDIT LAYERS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  LAYER 1: EXTRACTION VALIDATION (Automated)                    │
│  ├─ HTML structure verification                                │
│  ├─ Required fields presence check                             │
│  ├─ Data type validation                                       │
│  └─ Word count threshold (minimum 1,000 words)                 │
│                                                                 │
│  LAYER 2: SEMANTIC VALIDATION (Automated)                      │
│  ├─ Company name fuzzy match (Levenshtein < 30%)              │
│  ├─ Ticker symbol exact match                                  │
│  ├─ Date range plausibility (within earnings season)          │
│  ├─ Quarter matches fiscal calendar                            │
│  └─ Content contains expected keywords                         │
│                                                                 │
│  LAYER 3: CROSS-REFERENCE VALIDATION (Automated)               │
│  ├─ Kalshi event date alignment (±24 hours)                   │
│  ├─ Company name matches DynamoDB record                       │
│  ├─ Previous quarter comparison available                      │
│  └─ Duplicate detection (content hash)                         │
│                                                                 │
│  LAYER 4: HUMAN VERIFICATION (Manual)                          │
│  ├─ Side-by-side comparison UI                                 │
│  ├─ Source link clickable for manual check                     │
│  ├─ Verification notes field                                   │
│  └─ Approve / Reject workflow                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Validation Rules

```typescript
interface ValidationResult {
  passed: boolean;
  confidence: number;  // 0-100%
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;
  expected: string;
  actual: string;
  severity: 'critical' | 'major' | 'minor';
}

// Critical Validations (must pass)
const criticalChecks = [
  'ticker_matches_expected',
  'quarter_format_valid',
  'year_is_reasonable',
  'content_not_empty',
  'word_count_above_minimum',
];

// Major Validations (flag for review)
const majorChecks = [
  'company_name_fuzzy_match',
  'date_within_earnings_season',
  'participants_section_found',
  'transcript_structure_valid',
];

// Minor Validations (informational)
const minorChecks = [
  'previous_quarter_available',
  'word_count_similar_to_historical',
  'ceo_cfo_mentioned',
];
```

### 2.3 Confidence Scoring

```
CONFIDENCE CALCULATION:

Base Score: 100

Deductions:
- Critical check fails: -50 points each (auto-reject if any fail)
- Major check fails: -15 points each
- Minor check fails: -5 points each

Thresholds:
- 90-100: Auto-approve (with audit log)
- 70-89:  Flagged for human review
- 0-69:   Auto-reject (requires manual intervention)
```

### 2.4 Audit Log Schema

```typescript
interface AuditLog {
  auditId: string;
  transcriptId: string;
  timestamp: string;

  // Extraction details
  sourceUrl: string;
  extractedAt: string;
  rawHtmlHash: string;

  // Validation results
  validationResults: {
    layer1: ValidationResult;
    layer2: ValidationResult;
    layer3: ValidationResult;
  };

  overallConfidence: number;
  autoDecision: 'approve' | 'review' | 'reject';

  // Human review (if applicable)
  humanReview?: {
    reviewedAt: string;
    reviewedBy: string;
    decision: 'verified' | 'rejected';
    notes: string;
  };
}
```

## Phase 3: Implementation Plan

### 3.1 File Structure

```
scripts/
├── scraping/
│   ├── index.ts              # Main entry point
│   ├── scraper.ts            # Puppeteer/Playwright scraper
│   ├── parser.ts             # HTML to structured data
│   ├── validators/
│   │   ├── extraction.ts     # Layer 1 validation
│   │   ├── semantic.ts       # Layer 2 validation
│   │   ├── crossReference.ts # Layer 3 validation
│   │   └── index.ts          # Combined validator
│   ├── audit/
│   │   ├── logger.ts         # Audit log writer
│   │   ├── reporter.ts       # Generate audit reports
│   │   └── types.ts          # Audit interfaces
│   └── utils/
│       ├── fuzzyMatch.ts     # String comparison
│       ├── dateUtils.ts      # Date parsing/validation
│       └── hashUtils.ts      # Content hashing

server/
├── routes/
│   └── scraping.ts           # Scraping API endpoints

src/
├── pages/
│   └── ScrapingDashboard.tsx # Admin UI for scraping
├── components/
│   └── scraping/
│       ├── ScrapeQueue.tsx   # Queue management
│       ├── AuditResults.tsx  # Audit display
│       └── ReviewPanel.tsx   # Human review UI
```

### 3.2 Scraping Workflow

```
1. INPUT: Company ticker + Expected quarter
   │
   ▼
2. SCRAPE: Fetch Seeking Alpha transcript page
   │ - Use authenticated session
   │ - Handle rate limiting (2 req/min)
   │ - Store raw HTML backup
   │
   ▼
3. PARSE: Extract structured data
   │ - Company name, ticker, quarter, year
   │ - Call date and time
   │ - Full transcript content
   │ - Participant list
   │
   ▼
4. VALIDATE (Layer 1): Extraction checks
   │ - All required fields present?
   │ - Data types correct?
   │ - Word count sufficient?
   │
   ├──▶ FAIL: Log error, skip to next
   │
   ▼
5. VALIDATE (Layer 2): Semantic checks
   │ - Company name matches?
   │ - Quarter/year plausible?
   │ - Content looks like transcript?
   │
   ├──▶ FAIL: Flag for review
   │
   ▼
6. VALIDATE (Layer 3): Cross-reference
   │ - Matches Kalshi event?
   │ - Not a duplicate?
   │ - Date aligns with calendar?
   │
   ├──▶ FAIL: Flag for review
   │
   ▼
7. CALCULATE: Confidence score
   │
   ├──▶ Score >= 90: Auto-approve
   ├──▶ Score 70-89: Human review queue
   └──▶ Score < 70: Auto-reject
   │
   ▼
8. STORE: Save to DynamoDB
   │ - verificationStatus: 'pending' | 'verified'
   │ - Audit log entry
   │
   ▼
9. NOTIFY: Alert for manual review items
```

### 3.3 Rate Limiting & Safety

```typescript
const SCRAPING_CONFIG = {
  // Rate limits
  requestsPerMinute: 2,
  pauseBetweenRequests: 30000,  // 30 seconds
  maxRetries: 3,
  retryDelay: 60000,  // 1 minute

  // Session management
  sessionCookieRefreshInterval: 3600000,  // 1 hour
  maxRequestsPerSession: 50,

  // Safety
  maxDailyRequests: 100,
  respectRobotsTxt: true,
  userAgentRotation: false,  // Use real browser

  // Storage
  storeRawHtml: true,
  rawHtmlRetentionDays: 30,
};
```

## Phase 4: Accuracy Metrics & Monitoring

### 4.1 Dashboard Metrics

```
SCRAPING DASHBOARD

┌─────────────────────────────────────────────────────────────────┐
│  ACCURACY METRICS (Last 30 Days)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Total Scraped:        156                                      │
│  Auto-Approved:        142 (91%)                                │
│  Human Reviewed:        12 (8%)                                 │
│  Auto-Rejected:          2 (1%)                                 │
│                                                                 │
│  Avg Confidence Score: 94.2%                                    │
│                                                                 │
│  ────────────────────────────────────────                       │
│                                                                 │
│  VALIDATION BREAKDOWN                                           │
│                                                                 │
│  Layer 1 (Extraction):  99% pass rate                          │
│  Layer 2 (Semantic):    96% pass rate                          │
│  Layer 3 (Cross-Ref):   94% pass rate                          │
│                                                                 │
│  ────────────────────────────────────────                       │
│                                                                 │
│  COMMON ISSUES                                                  │
│                                                                 │
│  1. Company name mismatch:     5 occurrences                   │
│  2. Date off by 1 day:         3 occurrences                   │
│  3. Missing participants:      2 occurrences                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Audit Trail Requirements

Every transcript must have:
1. **Source URL** - Original Seeking Alpha URL
2. **Extraction Timestamp** - When data was scraped
3. **Raw HTML Hash** - SHA-256 of original HTML (for forensics)
4. **Validation Log** - Full results of all checks
5. **Confidence Score** - Calculated accuracy score
6. **Decision Record** - Auto/manual approval with timestamp
7. **Reviewer Notes** - Human notes if manually reviewed

## Phase 5: Error Handling & Recovery

### 5.1 Error Categories

| Error Type | Handling | Recovery |
|------------|----------|----------|
| Network timeout | Retry 3x with backoff | Queue for later |
| Login expired | Refresh session | Retry immediately |
| Page not found | Log warning | Skip company |
| Structure changed | Alert admin | Pause scraping |
| Rate limited | Pause 5 minutes | Resume automatically |
| Content validation fail | Flag for review | Human intervention |

### 5.2 Fallback Strategy

```
PRIMARY: Seeking Alpha authenticated scraping
    │
    ├──▶ FAIL: Try alternative URL patterns
    │
    ├──▶ FAIL: Queue for manual copy/paste
    │
    └──▶ FAIL: Mark company as "manual only"
```

## Phase 6: Security Considerations

### 6.1 Credential Management
- Seeking Alpha session stored in environment variables
- No credentials in code or logs
- Session refresh via secure cookie storage

### 6.2 Data Privacy
- No PII stored beyond company financial data
- Raw HTML stored temporarily (30 days)
- Audit logs retained for compliance

### 6.3 Rate Limit Compliance
- Respect Seeking Alpha ToS
- Implement polite scraping (delays, user-agent)
- Monitor for blocking signals

## Appendix A: Company-Ticker Mapping

See `scripts/update-earnings-with-words.ts` for the full COMPANY_TICKERS mapping (77+ companies).

## Appendix B: Validation Rule Definitions

### Company Name Fuzzy Match
```typescript
function fuzzyMatch(expected: string, actual: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = normalize(expected);
  const b = normalize(actual);

  // Exact match
  if (a === b) return true;

  // Contains match
  if (a.includes(b) || b.includes(a)) return true;

  // Levenshtein distance < 30%
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return distance / maxLen < 0.3;
}
```

### Date Plausibility Check
```typescript
function isDatePlausible(date: Date, quarter: string, year: number): boolean {
  const quarterMonths: Record<string, number[]> = {
    'Q1': [3, 4, 5],    // Jan-Mar earnings reported Apr-May
    'Q2': [6, 7, 8],    // Apr-Jun earnings reported Jul-Aug
    'Q3': [9, 10, 11],  // Jul-Sep earnings reported Oct-Nov
    'Q4': [0, 1, 2],    // Oct-Dec earnings reported Jan-Feb (next year)
  };

  const month = date.getMonth();
  const expectedMonths = quarterMonths[quarter];
  return expectedMonths?.includes(month) ?? false;
}
```

---

**Document Version:** 1.0
**Last Updated:** 2026-01-18
**Author:** Claude Code Assistant
**Status:** DRAFT - Pending Implementation
