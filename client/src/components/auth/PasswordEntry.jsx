import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordEntry({ id, label, visibilityLabel, value, onChange, disabled = false, invalid = false, describedBy }) {
  const [visible, setVisible] = useState(false);
  return <div className="account-password-entry">
    <label htmlFor={id}>{label}</label>
    <div className="account-password-input-wrap">
      <input id={id} name={id} type={visible ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={10} maxLength={128} required disabled={disabled} value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="account-action-input account-password-input" />
      <button type="button" disabled={disabled} onClick={() => setVisible(shown => !shown)} aria-label={(visible ? 'Hide' : 'Show') + ' ' + visibilityLabel} aria-controls={id} aria-pressed={visible} className="account-password-eye">{visible ? <EyeOff aria-hidden="true" size={20} strokeWidth={2.5} /> : <Eye aria-hidden="true" size={20} strokeWidth={2.5} />}</button>
    </div>
  </div>;
}
