// Word Analysis Utilities
// Following Kalshi MENTION contract rules

/**
 * Count occurrences of a word in text
 * Handles plurals (s), possessives ('s), and possessive plurals (s')
 */
export function countOccurrences(text: string, word: string): number {
  if (!word.trim()) return 0;
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escapedWord}(?:s|'s|s')?\\b`, 'gi');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Highlight word occurrences in text with HTML mark tags
 */
export function highlightWord(text: string, word: string): string {
  if (!word.trim()) return text;
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${escapedWord}(?:s|'s|s')?\\b`, 'gi');
  return text.replace(
    pattern,
    (match) => `<mark class="bg-yellow-500/30 text-yellow-300">${match}</mark>`
  );
}

/**
 * Extract company name from market title
 * Example: "What will Netflix say..." -> "Netflix"
 */
export function extractCompanyName(title: string, fallback: string): string {
  const match = title.match(/What will (\w+) say/i);
  return match ? match[1] : fallback;
}

/**
 * Generate quarter options for dropdown
 */
export function getQuarterOptions(): string[] {
  return ['Q1', 'Q2', 'Q3', 'Q4'];
}

/**
 * Generate year options for dropdown (last 5 years)
 */
export function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => currentYear - i);
}

/**
 * Format currency in cents to dollars
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Calculate bet cost and payout
 */
export function calculateBet(contracts: number, price: number): { cost: number; payout: number } {
  return {
    cost: (contracts * price) / 100,
    payout: contracts,
  };
}
