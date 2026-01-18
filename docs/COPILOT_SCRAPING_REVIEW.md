# Copilot Code Review Prompt: Seeking Alpha Web Scraping

## Context

You are reviewing a web scraping implementation for extracting earnings call transcripts from Seeking Alpha. This is a **personal use application** for a single user who has an authenticated Seeking Alpha account.

**Primary Goal:** 100% accuracy of scraped data. Every transcript must be verified to match the correct company, quarter, year, and date.

## Files to Review

When the scraping code is implemented, review these files:

```
scripts/scraping/
├── index.ts              # Main entry point
├── scraper.ts            # Browser automation (Puppeteer/Playwright)
├── parser.ts             # HTML to structured data extraction
├── validators/
│   ├── extraction.ts     # Layer 1: Field presence validation
│   ├── semantic.ts       # Layer 2: Data plausibility checks
│   ├── crossReference.ts # Layer 3: Cross-reference with Kalshi
│   └── index.ts          # Combined validator
└── audit/
    ├── logger.ts         # Audit log writer
    └── reporter.ts       # Accuracy metrics
```

---

## Review Checklist

### 1. DATA ACCURACY (Critical)

**Prompt for Copilot:**

> Review the parser.ts file and verify:
>
> 1. Company name extraction is robust - handles variations like "Apple Inc." vs "Apple" vs "AAPL"
> 2. Quarter parsing correctly identifies Q1/Q2/Q3/Q4 from various title formats
> 3. Date extraction handles multiple date formats (e.g., "Jan 21, 2026", "2026-01-21", "January 21st, 2026")
> 4. Transcript content extraction captures the FULL transcript, not just a preview
> 5. Word count calculation is accurate (splits on whitespace, filters empty strings)
>
> Flag any parsing logic that could silently fail or return partial data.

**Expected Issues to Catch:**
- Regex patterns that don't handle edge cases
- Missing null checks on DOM queries
- Hardcoded selectors that may break if SA changes layout
- Silent failures that don't throw errors

---

### 2. VALIDATION LOGIC (High Priority)

**Prompt for Copilot:**

> Review the validators/ directory and verify:
>
> 1. The fuzzy matching algorithm for company names uses Levenshtein distance correctly
> 2. Date plausibility check accounts for fiscal year differences (some companies have non-calendar fiscal years)
> 3. Cross-reference with Kalshi checks date within ±24 hours tolerance
> 4. Confidence score calculation correctly weights critical vs major vs minor checks
> 5. No validation check can be bypassed or skipped silently
>
> The confidence thresholds are:
> - 90-100: Auto-approve
> - 70-89: Flag for human review
> - 0-69: Auto-reject
>
> Verify these thresholds make sense given the validation weights.

**Expected Issues to Catch:**
- Off-by-one errors in date comparisons
- Fuzzy matching that's too lenient or too strict
- Missing edge cases (e.g., company name changes, ticker symbol changes)
- Validation order dependencies

---

### 3. ERROR HANDLING (High Priority)

**Prompt for Copilot:**

> Review error handling across all scraping files:
>
> 1. Network failures are caught and trigger retries with exponential backoff
> 2. Login session expiration is detected and triggers re-authentication
> 3. Page structure changes (selectors not found) are caught and logged as critical
> 4. Rate limiting responses (429) trigger appropriate pauses
> 5. Partial data extraction (some fields found, others missing) is flagged, not saved
>
> Verify that NO error scenario results in corrupted data being saved to DynamoDB.

**Expected Issues to Catch:**
- try/catch blocks that swallow errors
- Missing timeout handling
- Partial saves that could corrupt data integrity
- Race conditions in retry logic

---

### 4. SECURITY (Medium Priority)

**Prompt for Copilot:**

> Review security considerations:
>
> 1. Seeking Alpha credentials are not logged or exposed in error messages
> 2. Session cookies are stored securely (environment variables or secure storage)
> 3. Raw HTML storage doesn't expose sensitive data
> 4. Rate limiting is respected (max 2 requests/minute to avoid detection)
> 5. User-agent and headers look like a real browser
>
> Flag any hardcoded credentials, logged secrets, or aggressive scraping patterns.

---

### 5. AUDIT TRAIL (Medium Priority)

**Prompt for Copilot:**

> Review the audit/ directory:
>
> 1. Every scrape attempt is logged with timestamp, URL, and result
> 2. Validation failures include specific field and expected vs actual values
> 3. Confidence scores are logged with breakdown of which checks passed/failed
> 4. Human review decisions are recorded with reviewer notes
> 5. Audit logs can be used to reproduce any data extraction decision
>
> Verify the audit trail would be sufficient to investigate a data accuracy complaint.

---

### 6. INTEGRATION (Medium Priority)

**Prompt for Copilot:**

> Review integration with existing codebase:
>
> 1. Scraped transcripts use the same Transcript interface from server/lib/dynamodb.ts
> 2. verificationStatus is set to 'pending' for all new scrapes
> 3. Source metadata (sourceUrl, sourceTitle, parsedCompany, etc.) is populated
> 4. The scraper can be triggered via API endpoint or CLI script
> 5. Integration with TranscriptVerification UI component is seamless
>
> Check for interface mismatches or missing required fields.

---

## Summary Questions

After reviewing, answer these questions:

1. **Data Accuracy Risk:** On a scale of 1-10, how confident are you that this scraper will never save incorrect data? What's the biggest accuracy risk?

2. **Failure Modes:** What happens if Seeking Alpha changes their page structure? Will it fail gracefully or corrupt data?

3. **Audit Completeness:** If a transcript is later found to be incorrect, can the audit logs explain how it passed validation?

4. **Maintenance Burden:** How easy will it be to update the scraper when Seeking Alpha changes their HTML structure?

5. **Missing Validations:** Are there any validation checks that should be added to improve accuracy?

---

## Code Quality Standards

Apply these standards during review:

- **TypeScript:** All code must be fully typed. No `any` types except where absolutely necessary.
- **Error Messages:** All errors must include context (company, ticker, URL, field name).
- **Logging:** Use structured logging with severity levels (debug, info, warn, error).
- **Comments:** Complex parsing logic must have explanatory comments.
- **Tests:** Parser functions should have unit tests with real HTML fixtures.

---

## Example Review Comment Format

```
🔴 CRITICAL: [file:line] - Description of issue
   Impact: Data accuracy risk
   Fix: Suggested solution

🟡 WARNING: [file:line] - Description of concern
   Impact: Potential edge case failure
   Fix: Suggested improvement

🟢 SUGGESTION: [file:line] - Optional improvement
   Benefit: Better maintainability/performance
```

---

**Note:** This review focuses on DATA ACCURACY above all else. The user explicitly stated: "the dates in our system has to be 100% accurate. Accuracy is the top priority of this web application."

When in doubt, flag for human review rather than auto-approve.
