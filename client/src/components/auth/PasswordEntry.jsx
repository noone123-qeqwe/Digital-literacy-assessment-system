import React, { useRef, useState } from 'react';
import { ClipboardPaste, Copy, Eye, EyeOff } from 'lucide-react';

export default function PasswordEntry({ id, label, visibilityLabel, value, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback('Use the eye icon to show the password, then select the text and choose Copy.');
    }
  };

  const paste = async () => {
    try {
      // Read only after this field's Paste button is pressed. Browser clipboard
      // permissions still apply; never fall back to reading it automatically.
      const text = await navigator.clipboard.readText();
      if (!text) {
        setFeedback('Your clipboard has no text to paste.');
        return;
      }
      if (text.length > 128) {
        setFeedback('That password is too long. Use 128 characters or fewer.');
        return;
      }
      onChange(text);
      setFeedback(`${label} pasted.`);
      inputRef.current?.focus();
    } catch {
      setFeedback('Clipboard access is unavailable. Touch and hold the field and choose Paste, or use Ctrl+V (Command+V on Mac).');
      inputRef.current?.focus();
    }
  };

  const feedbackId = `${id}-clipboard-feedback`;
  return <div className="space-y-2">
    <label className="block text-sm font-semibold text-slate-800" htmlFor={id}>{label}</label>
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={10}
        maxLength={128}
        required
        disabled={disabled}
        value={value}
        onChange={(event) => { onChange(event.target.value); setFeedback(''); }}
        aria-describedby={feedback ? feedbackId : undefined}
        className="min-h-12 w-full select-text rounded-xl border border-slate-300 bg-slate-50 pl-4 pr-14 text-base text-slate-900 outline-none focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-700/10 disabled:opacity-60"
      />
      <button type="button" disabled={disabled} onClick={() => setVisible((shown) => !shown)} aria-label={`${visible ? 'Hide' : 'Show'} ${visibilityLabel}`} aria-controls={id} aria-pressed={visible} className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-50">
        {visible ? <EyeOff aria-hidden="true" size={20} strokeWidth={2.5} /> : <Eye aria-hidden="true" size={20} strokeWidth={2.5} />}
      </button>
    </div>
    <div className="flex flex-wrap justify-end gap-1">
      <button type="button" disabled={disabled || !value} onClick={copy} aria-label={`Copy ${visibilityLabel}`} aria-controls={id} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-40">
        <Copy size={15} aria-hidden="true" />Copy
      </button>
      <button type="button" disabled={disabled} onClick={paste} aria-label={`Paste ${visibilityLabel}`} aria-controls={id} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-green-800 hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:opacity-40">
        <ClipboardPaste size={15} aria-hidden="true" />Paste
      </button>
    </div>
    {feedback && <p id={feedbackId} role="status" className="text-xs leading-relaxed text-slate-600">{feedback}</p>}
  </div>;
}
