// Notes Tab Component
// Create and manage research notes for earnings analysis

import { useState } from 'react';
import { saveNote, deleteNote, type ResearchNote } from '@/lib/api/data';

interface NotesTabProps {
  eventTicker: string;
  companyName: string;
  notes: ResearchNote[];
  onNoteSaved: (note: ResearchNote) => void;
  onNoteDeleted: (note: ResearchNote) => void;
}

export function NotesTab({
  eventTicker,
  companyName,
  notes,
  onNoteSaved,
  onNoteDeleted,
}: NotesTabProps) {
  // Form state
  const [newNote, setNewNote] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Save note to DynamoDB
  const handleSaveNote = async () => {
    if (!newNote.trim()) return;

    setSavingNote(true);
    try {
      const tags = noteTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const note = await saveNote({
        eventTicker,
        company: companyName,
        content: newNote,
        tags,
      });

      onNoteSaved(note);
      setNewNote('');
      setNoteTags('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  // Delete note from DynamoDB
  const handleDeleteNote = async (note: ResearchNote) => {
    const timestamp = note.SK.replace('TIMESTAMP#', '');
    try {
      await deleteNote(eventTicker, timestamp);
      onNoteDeleted(note);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete note');
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Note Form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Add Research Note</h2>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="input w-full h-32 resize-none"
          placeholder="Add your research notes here..."
        />
        <div className="mt-3">
          <input
            type="text"
            value={noteTags}
            onChange={(e) => setNoteTags(e.target.value)}
            className="input w-full"
            placeholder="Tags (comma-separated): analyst, guidance, risk..."
          />
        </div>
        <button
          onClick={handleSaveNote}
          disabled={savingNote || !newNote.trim()}
          className="btn-primary mt-3 disabled:opacity-50"
        >
          {savingNote ? 'Saving...' : 'Save Note'}
        </button>
      </div>

      {/* Saved Notes */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">
          Saved Notes ({notes.length})
        </h2>
        {notes.length === 0 ? (
          <p className="text-slate-500 text-sm">No notes saved yet.</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <NoteCard key={note.SK} note={note} onDelete={handleDeleteNote} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Note card component
interface NoteCardProps {
  note: ResearchNote;
  onDelete: (note: ResearchNote) => void;
}

function NoteCard({ note, onDelete }: NoteCardProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-white whitespace-pre-wrap">{note.content}</p>
          {note.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            {new Date(note.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => onDelete(note)}
          className="text-slate-500 hover:text-loss-500 ml-2 transition-colors"
          title="Delete note"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
