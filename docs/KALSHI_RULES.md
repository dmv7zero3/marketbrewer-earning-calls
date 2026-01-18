# Kalshi Contract Rules

This document captures the Kalshi contract rules relevant to earnings call betting.

## MENTION Contracts (Word/Phrase Betting)

These rules apply to contracts betting on specific words being mentioned during earnings calls, speeches, or addresses.

### Key Definitions

- **<word>**: The particular word or phrase to be mentioned. Can include minimum mention counts or alternatives (e.g., "Doge/Dogecoin")
- **<address>**: The earnings call, speech, briefing, or other form of communication
- **<person>**: The speaker (CEO, CFO, or other executive)

### Word Matching Rules

#### INCLUDED (Count as Matches)

| Rule | Example |
|------|---------|
| **Plural forms** | "Immigrant" matches "Immigrants" |
| **Possessive forms** | "Egg" matches "eggs'" |
| **Compound words (hyphenated)** | "Palestine" matches "pro-Palestine" |
| **Compound words (open)** | "couch" matches "couch potato" |
| **Ordinal forms** (if word has number) | "January 6" matches "January 6th" |
| **Homonyms** | "ICE" matches "ice water" |
| **Homographs** | "bass" matches both "bass guitar" and "bass fishing" |
| **Adjacent context** | "Elon / Musk" matches "Elon University" |
| **Non-standard transliteration** | "Zelensky" matches "Zelenski", "Zelenskii" |

#### EXCLUDED (Do NOT Count)

| Rule | Example |
|------|---------|
| **Grammatical inflections** | "Immigrant" does NOT match "Immigration" |
| **Tense changes** | Word stem changes don't count |
| **Closed compound words** | "fire" does NOT match "firetruck" |
| **Other languages** | "fire" does NOT match "fuego" |
| **Homophones** | "write" does NOT match "right" |
| **Synonyms** | Similar meaning words don't count |

### Contract Settlement

- **Settlement Value**: $1.00 per contract
- **Minimum Tick**: $0.01
- **Position Limit**: $25,000 per strike, per member
- **Expiration Time**: 10:00 AM ET (day after address)
- **Source Agencies**: NYT, AP, Bloomberg, Reuters, Axios, Politico, Semafor, The Information, WaPo, WSJ, ABC, CBS, CNN, Fox News, MSNBC, NBC

### Important Notes

1. Revisions to transcripts made AFTER expiration are NOT counted
2. If event doesn't occur by <date>, "Event does not occur" resolves YES, all others NO
3. Kalshi may initiate Market Outcome Review before settlement

---

## Earnings Beat/Miss Contracts

*(To be documented - typical earnings call contracts)*

### Common Contract Types

1. **EPS Beat/Miss**: Will reported EPS beat analyst consensus?
2. **Revenue Beat/Miss**: Will reported revenue beat analyst consensus?
3. **Guidance**: Will company raise/lower forward guidance?

### Key Considerations for Analysis

- Historical beat rate (last 4-8 quarters)
- Analyst estimate revisions trend
- Whisper numbers vs. consensus
- Company's guidance history
- Sector performance context

---

## Using Rules in the App

When analyzing transcripts for MENTION contracts:

1. **Upload/paste transcript** to the detail page
2. **Search for target word** using the matching rules above
3. **Count occurrences** (accounting for plurals, compounds, etc.)
4. **Track context** - note which forms were found

### Transcript Analysis Features

- Word frequency counter
- Highlight matching words
- Export analysis results
- Save notes with transcript reference
