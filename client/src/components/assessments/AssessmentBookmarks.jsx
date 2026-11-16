import React from 'react';
import { Bookmark, RefreshCw } from 'lucide-react';
import './AssessmentBookmarks.css';

export function BookmarkButton({ assessment, bookmarks }) {
  const selected = bookmarks.saved.includes(assessment.id), busy = bookmarks.pending.includes(assessment.id);
  return <button type="button" className={`assessment-bookmark-button ${selected ? 'is-bookmarked' : ''}`}
    aria-pressed={selected} aria-label={`${selected ? 'Remove bookmark for' : 'Bookmark'} ${assessment.title}`}
    title={bookmarks.readOnly ? 'Bookmarks are unavailable in the read-only demonstration.' : selected ? 'Remove bookmark' : 'Bookmark assessment'}
    disabled={bookmarks.loading || Boolean(bookmarks.error) || busy || bookmarks.readOnly} onClick={() => bookmarks.toggle(assessment.id)}>
    {busy ? <RefreshCw size={17} aria-hidden="true" className="animate-spin" /> : <Bookmark size={17} aria-hidden="true" fill={selected ? 'currentColor' : 'none'} />}
    <span>{busy ? 'Saving…' : selected ? 'Bookmarked' : 'Bookmark'}</span>
  </button>;
}

export function BookmarkFilter({ bookmarks, records, selected, setSelected }) {
  const count = records.filter((record) => bookmarks.saved.includes(record.id)).length;
  return <div className="assessment-bookmark-toolbar">
    <div className="assessment-bookmark-filters" role="group" aria-label="Filter assessment bookmarks">
      <button type="button" aria-pressed={!selected} onClick={() => setSelected(false)}>All assessments <span>{records.length}</span></button>
      <button type="button" aria-pressed={selected} disabled={bookmarks.loading || Boolean(bookmarks.error)} onClick={() => setSelected(true)}><Bookmark size={16} aria-hidden="true" />Bookmarked <span>{count}</span></button>
    </div>
    <p>{bookmarks.loading ? 'Loading bookmarks…' : 'Your bookmarks are private and saved to your account.'}</p>
    {bookmarks.error && <div role="alert" className="assessment-bookmark-notice"><p>{bookmarks.error}</p><button type="button" onClick={bookmarks.retry}>Try again</button></div>}
  </div>;
}
