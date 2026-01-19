/**
 * Hash Utilities for Content Deduplication and Audit Trail
 *
 * Provides SHA-256 hashing for transcript content and raw HTML,
 * enabling duplicate detection and forensic audit capabilities.
 */

import crypto from 'crypto';

/**
 * Generate SHA-256 hash of content
 *
 * @param content - String content to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Normalize transcript content for consistent hashing
 *
 * Removes variations that shouldn't affect duplicate detection:
 * - Excess whitespace
 * - Line ending differences
 * - Unicode normalization
 * - Leading/trailing whitespace
 */
export function normalizeContentForHashing(content: string): string {
  return content
    .normalize('NFKC') // Unicode normalization
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ') // Collapse horizontal whitespace
    .replace(/\n+/g, '\n') // Collapse multiple newlines
    .trim();
}

/**
 * Generate content hash for transcript deduplication
 *
 * Uses normalized content to avoid false negatives from
 * minor formatting differences.
 *
 * @param content - Transcript content
 * @returns Hex-encoded SHA-256 hash
 */
export function generateContentHash(content: string): string {
  const normalized = normalizeContentForHashing(content);
  return sha256(normalized);
}

/**
 * Generate hash for raw HTML storage
 *
 * Used for audit trail - proves the original HTML content
 * at time of scraping.
 *
 * @param html - Raw HTML string
 * @returns Hex-encoded SHA-256 hash
 */
export function generateRawHtmlHash(html: string): string {
  // Don't normalize HTML - we want exact hash for forensics
  return sha256(html);
}

/**
 * Generate a unique ID for a transcript based on its metadata
 *
 * Format: {ticker}-{quarter}-{year}-{dateHash}
 * This provides a deterministic ID that can detect duplicates
 * even before content comparison.
 */
export function generateTranscriptId(
  ticker: string,
  quarter: string,
  year: number,
  date: string
): string {
  const normalized = `${ticker.toUpperCase()}-${quarter.toUpperCase()}-${year}-${date}`;
  const hash = sha256(normalized).substring(0, 8); // First 8 chars of hash
  return `${ticker.toUpperCase()}-${quarter.toUpperCase()}-${year}-${hash}`;
}

/**
 * Compare two content hashes
 */
export function hashesMatch(hash1: string, hash2: string): boolean {
  if (!hash1 || !hash2) return false;
  return hash1.toLowerCase() === hash2.toLowerCase();
}

/**
 * Check if content is a duplicate based on hash
 *
 * @param newContentHash - Hash of new content
 * @param existingHashes - Array of existing content hashes to check against
 * @returns Object with isDuplicate flag and matching hash if found
 */
export function checkDuplicate(
  newContentHash: string,
  existingHashes: string[]
): { isDuplicate: boolean; matchingHash: string | null } {
  for (const existingHash of existingHashes) {
    if (hashesMatch(newContentHash, existingHash)) {
      return { isDuplicate: true, matchingHash: existingHash };
    }
  }
  return { isDuplicate: false, matchingHash: null };
}

/**
 * Generate a similarity fingerprint for near-duplicate detection
 *
 * Creates multiple overlapping shingles (n-grams) and hashes them.
 * Useful for detecting near-duplicates with minor edits.
 *
 * @param content - Content to fingerprint
 * @param shingleSize - Number of words per shingle (default 5)
 * @param numHashes - Number of min-hash values to keep (default 100)
 */
export function generateFingerprint(
  content: string,
  shingleSize: number = 5,
  numHashes: number = 100
): string[] {
  const normalized = normalizeContentForHashing(content);
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);

  if (words.length < shingleSize) {
    // Content too short, return single hash
    return [sha256(normalized)];
  }

  // Generate shingles
  const shingles: Set<string> = new Set();
  for (let i = 0; i <= words.length - shingleSize; i++) {
    const shingle = words.slice(i, i + shingleSize).join(' ');
    shingles.add(shingle);
  }

  // Hash each shingle and keep the smallest numHashes (min-hash)
  const hashes = Array.from(shingles)
    .map((shingle) => sha256(shingle))
    .sort()
    .slice(0, numHashes);

  return hashes;
}

/**
 * Calculate Jaccard similarity between two fingerprints
 *
 * @returns Similarity score 0-1 (1 = identical)
 */
export function fingerprintSimilarity(fp1: string[], fp2: string[]): number {
  const set1 = new Set(fp1);
  const set2 = new Set(fp2);

  let intersection = 0;
  for (const hash of set1) {
    if (set2.has(hash)) {
      intersection++;
    }
  }

  const union = set1.size + set2.size - intersection;

  if (union === 0) return 1; // Both empty

  return intersection / union;
}

/**
 * Check for near-duplicates using fingerprinting
 *
 * @param newFingerprint - Fingerprint of new content
 * @param existingFingerprints - Map of ID to fingerprint
 * @param threshold - Minimum similarity to consider a near-duplicate (default 0.8)
 */
export function checkNearDuplicate(
  newFingerprint: string[],
  existingFingerprints: Map<string, string[]>,
  threshold: number = 0.8
): { isNearDuplicate: boolean; matchingId: string | null; similarity: number } {
  let maxSimilarity = 0;
  let matchingId: string | null = null;

  for (const [id, existingFp] of existingFingerprints) {
    const similarity = fingerprintSimilarity(newFingerprint, existingFp);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      matchingId = id;
    }
  }

  return {
    isNearDuplicate: maxSimilarity >= threshold,
    matchingId: maxSimilarity >= threshold ? matchingId : null,
    similarity: maxSimilarity,
  };
}

/**
 * Hash audit log entry for tamper detection
 */
export interface AuditHashInput {
  timestamp: string;
  sourceUrl: string;
  contentHash: string;
  validationResults: string; // JSON string of validation results
  decision: string;
}

export function generateAuditHash(input: AuditHashInput): string {
  const canonical = JSON.stringify({
    timestamp: input.timestamp,
    sourceUrl: input.sourceUrl,
    contentHash: input.contentHash,
    validationResults: input.validationResults,
    decision: input.decision,
  });

  return sha256(canonical);
}
