import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ConfirmSheet, Sheet, TopBar } from '../components'
import {
  addExtra, CATEGORIES, deleteTrip, formatRange, groupPackItems, isComingHome, makePermanent, newTemplate, nightsLabel,
  removeExtra, setHidden, toggleChecked, tripConditions, tripItems, updateTrip,
} from '../model'
import { loadPrefs } from '../prefs'
import { TemplateSheet } from './TemplateSheet'

const findEl = (attr, value) => [...document.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === value)

function AddOneOff({ onAdd }) {
  const [text, setText] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ Add for this trip" aria-label="Add a one-off item" />
      {text.trim() && <button className="btn small">Add</button>}
    </form>
  )
}

// Heading for a finished category or pack group. Tapping it shows or hides
// the checked items; unfinished ones are always open.
function DoneToggle({ toggleKey, label, count, open, onToggle }) {
  return (
    <button className="done-toggle" data-toggle={toggleKey} onClick={onToggle} aria-expanded={open}>
      {label}
      <span className="muted"> ✓ {count}/{count}</span>
      <span className="done-chevron muted" aria-hidden="true">{open ? '⌄' : '›'}</span>
    </button>
  )
}

function ItemRow({ item, onToggle, onMenu }) {
  return (
    <li className={`item ${item.checked ? 'done' : ''}`}>
      <button className="item-check" data-item={item.key} onClick={onToggle} role="checkbox" aria-checked={item.checked}>
        <span className="box" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        <span className="item-text">
          {item.text}
          {item.qty != null && <span className="qty">× {item.qty}</span>}
          {item.extraId && <span className="tag">this trip</span>}
        </span>
      </button>
      <button className="item-menu" onClick={onMenu} aria-label={`Options for ${item.text}`}>⋯</button>
    </li>
  )
}

export function TripScreen({ data, setData, go, today, tripId }) {
  const trip = data.trips.find((t) => t.id === tripId)
  const [hideCompleted, setHideCompleted] = useState(true)
  const [menuItem, setMenuItem] = useState(null)
  const [promoting, setPromoting] = useState(null) // { extraId, template }
  const [confirm, setConfirm] = useState(null)
  const [opened, setOpened] = useState(() => new Set()) // finished sections the user expanded
  const toggleOpen = (key) => setOpened((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Set on the home screen; read once when the trip opens.
  const [{ hideDelay, tapPause }] = useState(loadPrefs)

  // Recently checked items still shown crossed out; each has a timer.
  const [lingering, setLingering] = useState(() => new Set())
  const timers = useRef(new Map())
  useEffect(() => {
    const pending = timers.current
    return () => { for (const t of pending.values()) clearTimeout(t) }
  }, [])
  const settleUntil = useRef(0)
  const settled = () => Date.now() >= settleUntil.current
  const guard = (fn) => (...args) => { if (settled()) fn(...args) }

  // When a focused row disappears, focus moves to the next unchecked item in
  // its list, or to the heading the section collapses into.
  const refocus = useRef(null)
  useEffect(() => {
    const target = refocus.current
    if (!target) return
    refocus.current = null
    if (findEl('data-item', target.from)) return
    const el = target.toggle ? findEl('data-toggle', target.toggle) : findEl('data-item', target.item)
    el?.focus({ preventScroll: true })
  })

  const forget = (key) => setLingering((prev) => {
    const next = new Set(prev)
    next.delete(key)
    return next
  })
  // If this row has focus and is about to go, note where focus should land.
  const rememberFocus = (key) => {
    const row = findEl('data-item', key)
    if (row && row === document.activeElement) {
      const list = row.closest('ul')
      const unchecked = [...list.querySelectorAll('[data-item][aria-checked="false"]')].filter((el) => el !== row)
      const next = unchecked.find((el) => row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ?? unchecked.at(-1)
      refocus.current = next
        ? { from: key, item: next.getAttribute('data-item') }
        : { from: key, toggle: list.getAttribute('data-collapse') }
    }
  }
  const expire = (key) => {
    timers.current.delete(key)
    rememberFocus(key)
    forget(key)
  }
  const check = (item) => {
    clearTimeout(timers.current.get(item.key))
    timers.current.delete(item.key)
    if (item.checked) forget(item.key)
    else if (hideDelay === 0) rememberFocus(item.key)
    else {
      setLingering((prev) => new Set(prev).add(item.key))
      timers.current.set(item.key, setTimeout(() => expire(item.key), hideDelay))
    }
    setData((d) => toggleChecked(d, trip.id, item.key))
  }

  const items = tripItems(data, trip)
  const comingHome = isComingHome(trip, today)
  const done = items.filter((i) => i.checked).length
  const conditions = tripConditions(trip, data.questions)
  const unanswered = data.questions.filter((question) =>
    conditions.isAsked(question) && typeof trip.answers[question.id] !== 'boolean',
  )
  const hiddenTemplates = data.templates.filter((t) => trip.hidden[t.id] && conditions.applies(t))

  const patch = (p) => setData((d) => updateTrip(d, trip.id, (t) => ({ ...t, ...p })))
  const hide = (templateId, hidden) => setData((d) => setHidden(d, trip.id, templateId, hidden))

  // Checked and done lingering: counts as gone for hiding and collapsing.
  const gone = (i) => i.checked && !lingering.has(i.key)
  const shownKeys = [] // filled while rendering below; read after render
  const lastShown = useRef(null)
  useEffect(() => {
    const signature = shownKeys.join('|')
    if (lastShown.current !== null && lastShown.current !== signature) settleUntil.current = Date.now() + tapPause
    lastShown.current = signature
  })

  // While coming home, those reminders matter most, so show them first.
  const order = comingHome
    ? [...CATEGORIES.filter((c) => c.id === 'home'), ...CATEGORIES.filter((c) => c.id !== 'home')]
    : CATEGORIES

  return (
    <main>
      <TopBar
        title={trip.name || 'Untitled trip'}
        onBack={() => go({ name: 'trips' })}
        backLabel="Trips"
        action={<button className="link" onClick={() => go({ name: 'tripForm', id: trip.id })}>Edit</button>}
      />

      <section className="trip-summary">
        <div className="trip-summary-row">
          <p className="muted">
            {formatRange(trip)} · {nightsLabel(trip)} · {done} of {items.length} done
          </p>
          <label className="hide-completed">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            <span>Hide completed</span>
          </label>
        </div>
      </section>

      {!trip.ended && unanswered.length > 0 && (
        <section className="banner">
          <span>Answer {unanswered.length === 1 ? 'a trip question' : `${unanswered.length} trip questions`} to finish updating this list.</span>
          <button className="btn small" onClick={() => go({ name: 'tripForm', id: trip.id })}>Review questions</button>
        </section>
      )}

      {!trip.ended && (comingHome ? (
        <section className="banner home">
          <strong>Coming home</strong>
          <span>
            {Capacitor.isNativePlatform()
              ? 'Car reminders stop when you check everything off, end the trip, or three days after return. The trip stays open until you end it.'
              : 'Check these off before you get home.'}
          </span>
          {trip.headingHome && <button className="link" onClick={() => patch({ headingHome: false })}>Not yet</button>}
        </section>
      ) : today >= trip.start && (
        <section className="banner">
          <span>Leaving early? Turn on Coming Home reminders now.</span>
          <button className="btn small" onClick={() => patch({ headingHome: true })}>Heading home</button>
        </section>
      ))}

      {order.map((cat) => {
        const catItems = items.filter((i) => i.category === cat.id)
        const catDone = catItems.filter((i) => i.checked).length
        const catFinished = catItems.length > 0 && catItems.every(gone)
        const catKey = `cat:${cat.id}`
        const catOpen = opened.has(catKey)
        if (catFinished && !catOpen) {
          return (
            <section key={cat.id} className="category">
              <h2 className="section-title">
                <DoneToggle toggleKey={catKey} label={cat.label} count={catItems.length} open={false} onToggle={guard(() => toggleOpen(catKey))} />
              </h2>
            </section>
          )
        }
        // Hide completed applies to unfinished sections. A finished section the
        // user opened shows all its items so they can be reviewed or unchecked.
        const visible = (list) => (hideCompleted && !catFinished ? list.filter((i) => !gone(i)) : list)
        const groups = cat.id === 'pack' ? groupPackItems(catItems) : [{ group: null, items: catItems }]
        return (
          <section key={cat.id} className="category">
            <h2 className="section-title">
              {catFinished
                ? <DoneToggle toggleKey={catKey} label={cat.label} count={catItems.length} open onToggle={guard(() => toggleOpen(catKey))} />
                : <>{cat.label}{catItems.length > 0 && <span className="muted"> {catDone}/{catItems.length}</span>}</>}
            </h2>
            <div className="card">
              {groups.map(({ group, items: groupItems }) => {
                const groupDone = groupItems.filter((i) => i.checked).length
                // Inside an opened finished category, show everything in one tap.
                const groupFinished = group && !catFinished && groupItems.every(gone)
                const groupKey = `group:${group}`
                const groupOpen = groupFinished && opened.has(groupKey)
                const shown = groupFinished ? (groupOpen ? groupItems : []) : visible(groupItems)
                // Where focus goes if checking an item collapses this section.
                const rest = catItems.filter((i) => !groupItems.includes(i))
                const collapseKey = group && !rest.every(gone) ? groupKey : catKey
                shownKeys.push(...shown.map((i) => i.key))
                return (
                  <div key={group ?? 'all'}>
                    {group && (
                      <h3 className="group-title in-card">
                        {groupFinished
                          ? <DoneToggle toggleKey={groupKey} label={group} count={groupItems.length} open={groupOpen} onToggle={guard(() => toggleOpen(groupKey))} />
                          : <>{group}<span className="muted"> {groupDone}/{groupItems.length}</span></>}
                      </h3>
                    )}
                    {shown.length > 0 && (
                      <ul className="items" data-collapse={collapseKey}>
                        {shown.map((item) => (
                          <ItemRow
                            key={item.key}
                            item={item}
                            onToggle={guard(() => check(item))}
                            onMenu={guard(() => setMenuItem(item))}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
              {catItems.length === 0 && <p className="muted pad small">{cat.empty}</p>}
              <AddOneOff onAdd={(text) => setData((d) => addExtra(d, trip.id, cat.id, text))} />
            </div>
          </section>
        )
      })}

      {hiddenTemplates.length > 0 && (
        <section>
          <h2 className="section-title">Skipped for this trip</h2>
          <div className="card list">
            {hiddenTemplates.map((t) => (
              <div className="list-row" key={t.id}>
                <span className="muted">{t.text}</span>
                <button className="link" onClick={() => hide(t.id, false)}>Restore</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="trip-footer">
        {trip.ended
          ? <button className="btn" onClick={() => patch({ ended: false })}>Reopen trip</button>
          : <button className="btn" onClick={() => { patch({ ended: true }); go({ name: 'trips' }) }}>I'm home — end trip</button>}
        <button
          className="btn danger-text"
          onClick={() => setConfirm({
            title: 'Delete trip?',
            message: `“${trip.name || 'Untitled trip'}” and its check marks will be deleted. Your master list isn't affected.`,
            confirmLabel: 'Delete',
            onConfirm: () => { go({ name: 'trips' }); setData((d) => deleteTrip(d, trip.id)) },
          })}
        >
          Delete trip
        </button>
      </section>

      {menuItem && (
        <Sheet title={menuItem.text} onClose={() => setMenuItem(null)}>
          <div className="sheet-menu">
            {menuItem.templateId ? (
              <>
                <button className="btn wide" onClick={() => { hide(menuItem.templateId, true); setMenuItem(null) }}>
                  Not needed this trip
                </button>
                <button className="btn wide" onClick={() => go({
                  name: 'master',
                  itemId: menuItem.templateId,
                  returnTo: { name: 'trip', id: trip.id, label: trip.name || 'Trip' },
                })}>Edit in master list</button>
              </>
            ) : (
              <>
                <button className="btn primary wide" onClick={() => {
                  setPromoting({ extraId: menuItem.extraId, template: newTemplate(menuItem.category, { text: menuItem.text }) })
                  setMenuItem(null)
                }}>
                  Add to master list…
                </button>
                <button className="btn danger-text wide" onClick={() => { setData((d) => removeExtra(d, trip.id, menuItem.extraId)); setMenuItem(null) }}>
                  Remove from this trip
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}

      {promoting && (
        <TemplateSheet
          data={data}
          template={promoting.template}
          title="Add to master list"
          onSave={(template) => {
            setData((d) => makePermanent(d, trip.id, promoting.extraId, template))
            setPromoting(null)
          }}
          onClose={() => setPromoting(null)}
        />
      )}

      {confirm && <ConfirmSheet {...confirm} onClose={() => setConfirm(null)} />}
    </main>
  )
}
