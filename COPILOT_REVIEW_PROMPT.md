# Copilot Code Review Prompt

Use this prompt with GitHub Copilot or any AI code assistant to review this codebase and provide suggestions.

---

## Review Prompt

Please review this MarketBrewer Earnings Call codebase and provide comprehensive feedback on the following areas:

### 1. Code Quality & Best Practices

**Review the following files and patterns:**

- `src/lib/api/kalshi.ts` - Kalshi API client
- `src/lib/api/data.ts` - Frontend data API client
- `src/lib/utils/wordAnalysis.ts` - Word analysis utilities
- `src/hooks/useEarningsData.ts` - Custom React hook
- `server/lib/dynamodb.ts` - DynamoDB operations
- `server/lib/news.ts` - Google News RSS integration
- `server/index.ts` - Express server

**Questions to answer:**
- Are there any code smells or anti-patterns?
- Is error handling consistent and comprehensive?
- Are TypeScript types properly defined and exported?
- Is the code DRY (Don't Repeat Yourself)?
- Are there any potential memory leaks?
- Is async/await used correctly throughout?

### 2. Architecture & Design

**Current architecture:**
- React 18 frontend with TypeScript
- Express.js backend proxy server
- DynamoDB single-table design (no GSIs)
- Google News RSS for trend detection

**Questions to answer:**
- Is the component structure well-organized?
- Is the separation of concerns appropriate?
- Should any logic be moved to different layers?
- Are the API endpoints RESTful and consistent?
- Is the DynamoDB PK/SK pattern optimal for our access patterns?
- Should we add any caching layers?

### 3. React Component Review

**Review these components:**
- `src/pages/EarningsCallDetail.tsx` - Main page component
- `src/pages/Dashboard.tsx` - Dashboard page
- `src/components/earnings/*.tsx` - Modular UI components

**Questions to answer:**
- Is state management efficient?
- Are there unnecessary re-renders?
- Should we use React.memo, useMemo, or useCallback anywhere?
- Is the prop drilling acceptable or should we use Context?
- Are loading and error states handled consistently?

### 4. Security Review

**Check for:**
- XSS vulnerabilities in `dangerouslySetInnerHTML` usage
- Input validation on API endpoints
- Sensitive data exposure in client code
- CORS configuration security
- API key handling

### 5. Performance Optimization

**Review for:**
- Bundle size optimization opportunities
- Unnecessary dependencies
- Code splitting opportunities
- Image/asset optimization
- Database query efficiency
- API response caching

### 6. Testing Coverage

**Current tests:**
- `tests/smoke.test.ts` - 21 smoke tests
- `tests/unit/wordAnalysis.test.ts` - Word analysis tests
- `tests/unit/dynamodb.test.ts` - DynamoDB operation tests
- `tests/unit/news.test.ts` - News integration tests

**Questions to answer:**
- Are the tests comprehensive enough?
- What additional test cases should be added?
- Should we add integration tests?
- Should we add React component tests?

### 7. Documentation

**Check:**
- Are complex functions well-documented?
- Is CLAUDE.md accurate and complete?
- Should we add JSDoc comments?
- Are API endpoints documented?

### 8. Specific Code Review Requests

1. **Word Analysis Logic** (`src/lib/utils/wordAnalysis.ts`):
   - Is the regex pattern correct for Kalshi MENTION rules?
   - Are we handling all edge cases (plurals, possessives)?

2. **DynamoDB Operations** (`server/lib/dynamodb.ts`):
   - Is the single-table design efficient?
   - Are we handling pagination for scan operations?
   - Is TTL properly implemented?

3. **News Caching** (`server/lib/news.ts`):
   - Is the 6-hour cache TTL appropriate?
   - Should we add rate limiting?
   - Is the RSS parsing robust?

4. **Custom Hook** (`src/hooks/useEarningsData.ts`):
   - Is the data fetching efficient?
   - Are we handling loading/error states correctly?
   - Should we add data refetching logic?

---

## Expected Output Format

Please provide your feedback in this format:

```markdown
## Summary
[Brief overall assessment]

## Critical Issues
[Security vulnerabilities, bugs, or major problems]

## Recommended Improvements
[Prioritized list of suggestions]

## Code Snippets
[Specific code changes with before/after examples]

## Questions for Clarification
[Any questions about requirements or intent]
```

---

## How to Use This Prompt

### In GitHub Copilot Chat:
1. Open the workspace in VS Code
2. Open Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
3. Type `@workspace` and paste this prompt
4. Review the suggestions

### In Claude Code:
1. Paste this prompt in your conversation
2. Ask Claude to review specific files or patterns

### In ChatGPT or other AI:
1. Share the relevant code files
2. Use this prompt as context for the review

---

## Project Context

**Purpose:** Personal earnings call betting assistant that integrates with Kalshi prediction markets

**Key Features:**
- View MENTION word bets from Kalshi
- Upload and analyze earnings call transcripts
- Track word frequency across quarters
- Detect trending words via Google News
- Track betting history and performance

**Tech Stack:**
- Frontend: React 18, TypeScript, Tailwind CSS, D3.js
- Backend: Express.js, Bun runtime
- Database: DynamoDB (single-table, no GSIs)
- Build: Webpack 5

**Constraints:**
- No GSIs in DynamoDB (cost optimization)
- Personal use first (no auth required)
- Free news API only (Google News RSS)
