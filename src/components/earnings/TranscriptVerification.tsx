// Transcript Verification Component
// Displays side-by-side comparison for verifying transcript accuracy

import { useState } from 'react';
import { verifyTranscript, type Transcript } from '@/lib/api/data';

interface TranscriptVerificationProps {
  transcript: Transcript;
  expectedCompany: string;
  expectedTicker?: string;
  expectedQuarter?: string;
  onVerified: (status: 'verified' | 'rejected') => void;
  onCancel: () => void;
}

export function TranscriptVerification({
  transcript,
  expectedCompany,
  expectedTicker,
  expectedQuarter,
  onVerified,
  onCancel,
}: TranscriptVerificationProps) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Compare fields and determine match status
  const comparisons = [
    {
      label: 'Company',
      expected: expectedCompany,
      actual: transcript.parsedCompany || transcript.company,
      match: fuzzyMatch(expectedCompany, transcript.parsedCompany || transcript.company),
    },
    {
      label: 'Ticker',
      expected: expectedTicker || 'N/A',
      actual: transcript.sourceTicker || 'N/A',
      match: !expectedTicker || expectedTicker === transcript.sourceTicker,
    },
    {
      label: 'Quarter',
      expected: expectedQuarter || `${transcript.quarter} ${transcript.year}`,
      actual: transcript.parsedQuarter || `${transcript.quarter} ${transcript.year}`,
      match: !expectedQuarter || fuzzyMatch(expectedQuarter, transcript.parsedQuarter || ''),
    },
    {
      label: 'Date',
      expected: transcript.date,
      actual: transcript.parsedEarningsDate || transcript.sourceDate || transcript.date,
      match: true, // Date comparison is informational
    },
  ];

  const allMatch = comparisons.every((c) => c.match);

  const handleVerify = async (status: 'verified' | 'rejected') => {
    setSaving(true);
    try {
      await verifyTranscript(transcript.eventTicker, transcript.date, status, notes || undefined);
      onVerified(status);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to verify transcript');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Verify Transcript</h2>
        <span
          className={`px-2 py-1 rounded text-xs ${
            allMatch
              ? 'bg-profit-500/20 text-profit-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}
        >
          {allMatch ? 'All fields match' : 'Review required'}
        </span>
      </div>

      {/* Source Info */}
      {transcript.sourceUrl && (
        <div className="mb-4 p-3 bg-slate-800 rounded-lg">
          <p className="text-xs text-slate-400 mb-1">Source</p>
          <a
            href={transcript.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 break-all"
          >
            {transcript.sourceUrl}
          </a>
          {transcript.sourceTitle && (
            <p className="text-sm text-slate-300 mt-2">"{transcript.sourceTitle}"</p>
          )}
        </div>
      )}

      {/* Comparison Table */}
      <div className="mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 text-slate-400 font-medium">Field</th>
              <th className="text-left py-2 text-slate-400 font-medium">Expected</th>
              <th className="text-left py-2 text-slate-400 font-medium">From Source</th>
              <th className="text-center py-2 text-slate-400 font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.label} className="border-b border-slate-800">
                <td className="py-2 text-slate-300">{c.label}</td>
                <td className="py-2 text-white font-mono">{c.expected}</td>
                <td
                  className={`py-2 font-mono ${
                    c.match ? 'text-white' : 'text-yellow-400'
                  }`}
                >
                  {c.actual}
                </td>
                <td className="py-2 text-center">
                  {c.match ? (
                    <span className="text-profit-400">✓</span>
                  ) : (
                    <span className="text-yellow-400">⚠</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transcript Preview */}
      <div className="mb-4">
        <p className="text-xs text-slate-400 mb-2">Content Preview</p>
        <div className="p-3 bg-slate-900 rounded text-sm font-mono text-slate-300 max-h-32 overflow-y-auto">
          {transcript.content.slice(0, 500)}
          {transcript.content.length > 500 && '...'}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {transcript.wordCount.toLocaleString()} words total
        </p>
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label className="text-xs text-slate-400 block mb-2">
          Verification Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input w-full h-20 resize-none text-sm"
          placeholder="Add any notes about this verification..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => handleVerify('verified')}
          disabled={saving}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Verify & Save'}
        </button>
        <button
          onClick={() => handleVerify('rejected')}
          disabled={saving}
          className="px-4 py-2 bg-loss-500/20 text-loss-400 rounded-lg hover:bg-loss-500/30 transition-colors disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Fuzzy match helper - checks if strings are similar
function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const normalA = normalize(a);
  const normalB = normalize(b);

  // Exact match after normalization
  if (normalA === normalB) return true;

  // One contains the other
  if (normalA.includes(normalB) || normalB.includes(normalA)) return true;

  // Levenshtein distance for small strings
  if (normalA.length < 20 && normalB.length < 20) {
    const distance = levenshtein(normalA, normalB);
    const maxLen = Math.max(normalA.length, normalB.length);
    return distance / maxLen < 0.3; // Allow 30% difference
  }

  return false;
}

// Simple Levenshtein distance implementation
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Verification status badge component
export function VerificationBadge({
  status,
}: {
  status: Transcript['verificationStatus'];
}) {
  const styles = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    verified: 'bg-profit-500/20 text-profit-400',
    rejected: 'bg-loss-500/20 text-loss-400',
  };

  const labels = {
    pending: 'Pending Review',
    verified: 'Verified',
    rejected: 'Rejected',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
