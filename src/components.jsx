import { useEffect, useRef } from 'react'
import { AUTO_CONDITIONS, NEVER_CONDITION } from './model'

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

// The tallest the window has been at its current width: its height without the
// on-screen keyboard, even in web views that shrink the layout for it. Measured
// from launch, so a keyboard opened before a sheet (e.g. by Search) still counts.
let fullViewport = { width: 0, height: 0 }
const measureViewport = () => {
  const { innerWidth: width, innerHeight: height } = window
  fullViewport = { width, height: fullViewport.width === width ? Math.max(fullViewport.height, height) : height }
}
measureViewport()
window.addEventListener('resize', measureViewport)

// Bottom sheet on phones, centered card on wide screens.
export function Sheet({ title, onClose, children, pinned }) {
  const backdropRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!pinned || !viewport) return
    const backdrop = backdropRef.current
    const { style } = backdrop
    // Keep the actions above the on-screen keyboard when it covers the page.
    const fitViewport = () => {
      measureViewport()
      // Account for zoom before estimating keyboard space.
      const keyboardOpen = fullViewport.height - viewport.height * viewport.scale > 100
      backdrop.classList.toggle('keyboard-open', keyboardOpen)
      style.setProperty('--sheet-viewport-top', `${viewport.offsetTop}px`)
      style.setProperty('--sheet-viewport-height', `${viewport.height}px`)
    }
    fitViewport()
    viewport.addEventListener('resize', fitViewport)
    viewport.addEventListener('scroll', fitViewport)
    window.addEventListener('resize', fitViewport)
    return () => {
      viewport.removeEventListener('resize', fitViewport)
      viewport.removeEventListener('scroll', fitViewport)
      window.removeEventListener('resize', fitViewport)
      backdrop.classList.remove('keyboard-open')
      style.removeProperty('--sheet-viewport-top')
      style.removeProperty('--sheet-viewport-height')
    }
  }, [pinned])

  return (
    <div ref={backdropRef} className={pinned ? 'sheet-backdrop pinned-actions' : 'sheet-backdrop'} onClick={onClose}>
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

function ConditionChips({ questions, value, onChange }) {
  const flip = (id) => onChange(value.includes(id) ? value.filter((c) => c !== id) : [...value, id])
  return (
    <div className="chips">
      {[...questions, ...AUTO_CONDITIONS].map(({ id, text }) => (
        <button
          type="button"
          key={id}
          className={`chip ${value.includes(id) ? 'on' : ''}`}
          aria-pressed={value.includes(id)}
          onClick={() => flip(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function QuestionConditionPicker({ questions, value, onChange }) {
  return (
    <fieldset className="conditions">
      <legend>Only ask when…</legend>
      <ConditionChips questions={questions} value={value} onChange={onChange} />
      <p className="muted small">
        {value.length === 0 ? 'Asked on every trip.' : 'Asked when any selected condition matches.'}
      </p>
    </fieldset>
  )
}

export function QuestionAutoYesPicker({ questions, value, onChange }) {
  return (
    <fieldset className="conditions">
      <legend>Auto yes when…</legend>
      <ConditionChips questions={questions} value={value} onChange={onChange} />
      <p className="muted small">
        {value.length === 0
          ? 'Answered as usual on every trip.'
          : 'Counts as yes, and isn’t asked, when any selected condition matches.'}
      </p>
    </fieldset>
  )
}

export function ItemConditionPicker({ questions, value, onChange }) {
  const options = questions.map(({ id, short, text }) => ({ id, text: short || text }))
  const groups = value.length ? value : [{ all: [] }]
  const hasConditions = groups.some(({ all }) => all.some((id) => id !== NEVER_CONDITION.id))
  const hasAlternatives = groups.length > 1

  return (
    <fieldset className="conditions item-conditions">
      <legend>When</legend>
      {groups.map(({ all }, index) => (
        <div className="condition-group" key={index} role="group" aria-label={`Condition group ${index + 1}`}>
          {hasAlternatives && (
            <div className="condition-group-head">
              {index > 0 && <span>Or</span>}
              <button
                type="button" className="link small" aria-label={`Remove condition group ${index + 1}`}
                onClick={() => onChange(groups.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          )}
          <ConditionChips
            questions={all.includes(NEVER_CONDITION.id) ? [...options, NEVER_CONDITION] : options}
            value={all}
            onChange={(next) => onChange(groups.map((group, i) => i === index
              ? { all: next.filter((id) => id !== NEVER_CONDITION.id) }
              : group))}
          />
        </div>
      ))}
      {(hasConditions || hasAlternatives) && (
        <button
          type="button" className="link small" disabled={groups.some(({ all }) => all.length === 0)}
          onClick={() => onChange([...groups, { all: [] }])}
        >
          Add alternative
        </button>
      )}
    </fieldset>
  )
}

// A labelled row with a compact picker on the right (a wheel on iPhone).
export function ChoiceRow({ label, hint, options, value, onChange }) {
  return (
    <label className="choice-row">
      <span>
        {label}
        {hint && <small className="muted block">{hint}</small>}
      </span>
      <span className="choice-select">
        <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </span>
    </label>
  )
}
