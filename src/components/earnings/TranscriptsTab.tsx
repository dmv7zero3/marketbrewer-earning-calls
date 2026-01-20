// Transcripts Tab Component
// Upload and manage earnings call transcripts for word analysis

import { useState } from 'react';
import { saveTranscript, deleteTranscript, type Transcript } from '@/lib/api/data';
import {
  countOccurrences,
  highlightWord,
  getQuarterOptions,
  getYearOptions,
} from '@/lib/utils/wordAnalysis';
import { TranscriptVerification, VerificationBadge } from './TranscriptVerification';

interface TranscriptsTabProps {
  eventTicker: string;
  companyName: string;
  stockTicker?: string;
  transcripts: Transcript[];
  onTranscriptSaved: (transcript: Transcript) => void;
  onTranscriptUpdated?: (transcript: Transcript) => void;
  onTranscriptDeleted?: (transcript: Transcript) => void;
}

export function TranscriptsTab({
  eventTicker,
  companyName,
  stockTicker,
  transcripts,
  onTranscriptSaved,
  onTranscriptUpdated,
  onTranscriptDeleted,
}: TranscriptsTabProps) {
  // Form state
  const [newTranscript, setNewTranscript] = useState('');
  const [selectedQuarter, setSelectedQuarter] = useState('Q4');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [savingTranscript, setSavingTranscript] = useState(false);

  // Search state
  const [searchWord, setSearchWord] = useState('');
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);

  // Verification state
  const [verifyingTranscript, setVerifyingTranscript] = useState<Transcript | null>(null);

  // Options
  const quarterOptions = getQuarterOptions();
  const yearOptions = getYearOptions();

  // Save transcript to DynamoDB
  const handleSaveTranscript = async () => {
    if (!newTranscript.trim()) return;

    setSavingTranscript(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const transcript = await saveTranscript({
        eventTicker,
        company: companyName,
        date,
        quarter: selectedQuarter,
        year: selectedYear,
        content: newTranscript,
      });

      onTranscriptSaved(transcript);
      setNewTranscript('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save transcript');
    } finally {
      setSavingTranscript(false);
    }
  };

  // Calculate total occurrences across all transcripts
  const totalOccurrences = searchWord
    ? transcripts.reduce((sum, t) => sum + countOccurrences(t.content, searchWord), 0)
    : 0;

  // Handle verification complete
  const handleVerificationComplete = (status: 'verified' | 'rejected') => {
    if (verifyingTranscript && onTranscriptUpdated) {
      onTranscriptUpdated({
        ...verifyingTranscript,
        verificationStatus: status,
        verifiedAt: new Date().toISOString(),
      });
    }
    setVerifyingTranscript(null);
  };

  // Handle transcript deletion
  const handleDelete = async (transcript: Transcript) => {
    if (!confirm(`Delete transcript for ${transcript.quarter} ${transcript.year}?`)) {
      return;
    }

    try {
      await deleteTranscript(transcript.eventTicker, transcript.date);
      if (onTranscriptDeleted) {
        onTranscriptDeleted(transcript);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transcript');
    }
  };

  // Get pending transcripts count
  const pendingCount = transcripts.filter((t) => t.verificationStatus === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Verification Modal */}
      {verifyingTranscript && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <TranscriptVerification
              transcript={verifyingTranscript}
              expectedCompany={companyName}
              expectedTicker={stockTicker}
              expectedQuarter={`${selectedQuarter} ${selectedYear}`}
              onVerified={handleVerificationComplete}
              onCancel={() => setVerifyingTranscript(null)}
            />
          </div>
        </div>
      )}

      {/* Pending Verification Alert */}
      {pendingCount > 0 && (
        <div className="card bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 text-xl">⚠</span>
            <div>
              <p className="text-yellow-400 font-medium">
                {pendingCount} transcript{pendingCount > 1 ? 's' : ''} pending verification
              </p>
              <p className="text-sm text-slate-400">
                Click "Verify" on a transcript to confirm accuracy before using for analysis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Transcript */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Add Earnings Call Transcript
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Paste transcript from Seeking Alpha. Word counts will appear in the Word Bets tab.
          Track transcripts quarter-over-quarter and year-over-year.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-slate-400 block mb-2">Quarter</label>
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="input w-full"
            >
              {quarterOptions.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-400 block mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="input w-full"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          value={newTranscript}
          onChange={(e) => setNewTranscript(e.target.value)}
          className="input w-full h-48 resize-none font-mono text-sm"
          placeholder="Paste earnings call transcript here..."
        />
        <button
          onClick={handleSaveTranscript}
          disabled={savingTranscript || !newTranscript.trim()}
          className="btn-primary mt-3 disabled:opacity-50"
        >
          {savingTranscript ? 'Saving...' : 'Save Transcript'}
        </button>
      </div>

      {/* Word Search */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Search Word in Transcripts
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchWord}
            onChange={(e) => setSearchWord(e.target.value)}
            className="input flex-1"
            placeholder="Search for word..."
          />
        </div>
        {searchWord && transcripts.length > 0 && (
          <div className="mt-3 p-3 bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-300">
              Found{' '}
              <span className="text-profit-500 font-bold">{totalOccurrences}</span>{' '}
              occurrences of "{searchWord}" across {transcripts.length} transcripts
            </p>
          </div>
        )}
      </div>

      {/* Saved Transcripts */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Saved Transcripts ({transcripts.length})
        </h2>
        {transcripts.length === 0 ? (
          <p className="text-slate-500 text-sm">No transcripts saved yet. Add one above.</p>
        ) : (
          <div className="space-y-4">
            {transcripts.map((t) => (
              <TranscriptCard
                key={t.SK}
                transcript={t}
                searchWord={searchWord}
                isExpanded={expandedTranscript === t.SK}
                onToggle={() =>
                  setExpandedTranscript(expandedTranscript === t.SK ? null : t.SK)
                }
                onVerify={() => setVerifyingTranscript(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Transcript card component
interface TranscriptCardProps {
  transcript: Transcript;
  searchWord: string;
  isExpanded: boolean;
  onToggle: () => void;
  onVerify: () => void;
  onDelete: () => void;
}

function TranscriptCard({
  transcript,
  searchWord,
  isExpanded,
  onToggle,
  onVerify,
  onDelete,
}: TranscriptCardProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white">
            {transcript.quarter} {transcript.year}
          </span>
          <VerificationBadge status={transcript.verificationStatus} />
          <span className="text-slate-500 text-sm">
            {transcript.wordCount.toLocaleString()} words
          </span>
        </div>
        <div className="flex items-center gap-2">
          {transcript.verificationStatus === 'pending' && (
            <button
              onClick={onVerify}
              className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
            >
              Verify
            </button>
          )}
          <button
            onClick={onToggle}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 text-loss-400 hover:bg-loss-500/20 rounded transition-colors"
            title="Delete transcript"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Source info */}
      {transcript.sourceUrl && (
        <div className="mb-2 text-xs text-slate-500">
          <a
            href={transcript.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            View source
          </a>
          {transcript.verifiedAt && (
            <span className="ml-2">
              • Verified {new Date(transcript.verifiedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {isExpanded && (
        <div
          className="mt-3 p-3 bg-slate-900 rounded text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
          dangerouslySetInnerHTML={{
            __html: searchWord
              ? highlightWord(transcript.content, searchWord)
              : transcript.content,
          }}
        />
      )}
    </div>
  );
}
