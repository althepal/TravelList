import { useEffect } from 'react'
import { AUTO_CONDITIONS } from './model'

export function TopBar({ title, onBack, backLabel = 'Back', action }) {
  return (
    <header className="topbar">
      <div className="topbar-side">
        {onBack && <button className="link back" onClick={onBack}>‹ {backLabel}</button>}
      </div>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-side right">{action}</div>
    </header>
  )
}

// Bottom sheet on phones, centered card on wide screens.
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmSheet({ title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="sheet-text">{message}</p>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </div>
    </Sheet>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <small className="muted block">{hint}</small>}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

// "Only if": one condition that must also be true, e.g. Max is coming.
export function RequirePicker({ questions, value, onChange }) {
  return (
    <label className="field">
      <span>Only if</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— (no extra requirement)</option>
        {questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
        {AUTO_CONDITIONS.map((a) => <option key={a.id} value={a.id}>{a.text}</option>)}
      </select>
    </label>
  )
}

// Picks the conditions (trip answers or automatic ones) something depends on;
// any one of them is enough. Empty = every trip.
export function ConditionPicker({
  questions, value, onChange,
  legend = 'Include on trips where…',
  emptyText = 'Nothing selected: included on every trip.',
  anyText = 'Included when any selected is true.',
}) {
  const flip = (id) => onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id])
  const options = [...questions.map((q) => ({ id: q.id, text: q.text })), ...AUTO_CONDITIONS]
  return (
    <fieldset className="conditions">
      <legend>{legend}</legend>
      <div className="chips">
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            className={`chip ${value.includes(o.id) ? 'on' : ''}`}
            aria-pressed={value.includes(o.id)}
            onClick={() => flip(o.id)}
          >
            {o.text}
          </button>
        ))}
      </div>
      <p className="muted small">
        {value.length === 0 ? emptyText : anyText}
      </p>
    </fieldset>
  )
}
