import React, { useRef, useState } from 'react';
import { ClipboardPaste, Copy, Eye, EyeOff } from 'lucide-react';

export default function PasswordEntry({ id, label, visibilityLabel, value, onChange, disabled = false, invalid = false, describedBy }) {
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback(label + ' copied.');
    } catch {
      setFeedback('Use the eye icon to show the password, then select the text and choose Copy.');
    }
  };

  const paste = async () => {
    try {
      // Clipboard access is requested only by this explicit button press.
      const text = await navigator.clipboard.readText();
      if (!text) { setFeedback('Your clipboard has no text to paste.'); return; }
      if (text.length > 128) { setFeedback('That password is too long. Use 128 characters or fewer.'); return; }
      onChange(text);
      setFeedback(label + ' pasted.');
      inputRef.current?.focus();
    } catch {
      setFeedback('Clipboard access is unavailable. Touch and hold the field and choose Paste, or use Ctrl+V (Command+V on Mac).');
      inputRef.current?.focus();
    }
  };

  const feedbackId = id + '-clipboard-feedback';
  const description = [describedBy, feedback ? feedbackId : null].filter(Boolean).join(' ') || undefined;
  return <div className="account-password-entry">
    <div className="account-password-label-row">
      <label htmlFor={id}>{label}</label>
      <div className="account-clipboard-actions">
        <button type="button" disabled={disabled || !value} onClick={copy} aria-label={'Copy ' + visibilityLabel} aria-controls={id}><Copy size={14} aria-hidden="true" />Copy</button>
        <button type="button" disabled={disabled} onClick={paste} aria-label={'Paste ' + visibilityLabel} aria-controls={id}><ClipboardPaste size={14} aria-hidden="true" />Paste</button>
      </div>
    </div>
    <div className="account-password-input-wrap">
      <input ref={inputRef} id={id} name={id} type={visible ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={10} maxLength={128} required disabled={disabled} value={value} onChange={event => { onChange(event.target.value); setFeedback(''); }} aria-invalid={invalid || undefined} aria-describedby={description} className="account-action-input account-password-input" />
      <button type="button" disabled={disabled} onClick={() => setVisible(shown => !shown)} aria-label={(visible ? 'Hide' : 'Show') + ' ' + visibilityLabel} aria-controls={id} aria-pressed={visible} className="account-password-eye">{visible ? <EyeOff aria-hidden="true" size={20} strokeWidth={2.5} /> : <Eye aria-hidden="true" size={20} strokeWidth={2.5} />}</button>
    </div>
    {feedback && <p id={feedbackId} role="status" className="account-clipboard-feedback">{feedback}</p>}
  </div>;
}
