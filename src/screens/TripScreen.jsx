import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ConditionPicker, ConfirmSheet, RequirePicker, Sheet, TopBar } from '../components'
import {
  CATEGORIES, formatRange, groupPackItems, isComingHome, makePermanent, newId, nightsOf,
  toggleChecked, tripItems, updateTrip,
} from '../model'

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

function ItemRow({ item, onToggle, onMenu }) {
  return (
    <li className={`item ${item.checked ? 'done' : ''}`}>
      <button className="item-check" onClick={onToggle} aria-pressed={item.checked}>
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
  const [menuItem, setMenuItem] = useState(null)
  const [promoting, setPromoting] = useState(null) // {item, when}
  const [confirm, setConfirm] = useState(null)

  const items = tripItems(data, trip)
  const comingHome = isComingHome(trip, today)
  const nights = nightsOf(trip)
  const done = items.filter((i) => i.checked).length
  const hiddenTemplates = data.templates.filter((t) => trip.hidden[t.id])

  const patch = (p) => setData((d) => updateTrip(d, trip.id, (t) => ({ ...t, ...p })))
  const addExtra = (category, text) =>
    setData((d) => updateTrip(d, trip.id, (t) => ({ ...t, extras: [...t.extras, { id: newId(), category, text }] })))
  const setHidden = (templateId, hidden) =>
    setData((d) => updateTrip(d, trip.id, (t) => ({ ...t, hidden: { ...t.hidden, [templateId]: hidden || undefined } })))
  const deleteExtra = (extraId) =>
    setData((d) => updateTrip(d, trip.id, (t) => ({ ...t, extras: t.extras.filter((x) => x.id !== extraId) })))

  // While coming home, those reminders matter most, so show them first.
  const order = comingHome
    ? [CATEGORIES[3], ...CATEGORIES.slice(0, 3)]
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
        <p className="muted">
          {formatRange(trip)} · {nights === 0 ? 'day trip' : `${nights} night${nights > 1 ? 's' : ''}`} · {done} of {items.length} done
        </p>
        <div className="progress" aria-hidden="true">
          <div style={{ width: items.length ? `${(done / items.length) * 100}%` : 0 }} />
        </div>
      </section>

      {!trip.ended && (comingHome ? (
        <section className="banner home">
          <strong>Coming home</strong>
          <span>
            {Capacitor.isNativePlatform()
              ? 'Your car reminders are on until these are checked off.'
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
        return (
          <section key={cat.id} className="category">
            <h2 className="section-title">
              {cat.label}
              {catItems.length > 0 && <span className="muted"> {catDone}/{catItems.length}</span>}
            </h2>
            <div className="card">
              {(cat.id === 'pack' ? groupPackItems(catItems) : [{ group: null, items: catItems }]).map(({ group, items: groupItems }) => (
                <div key={group ?? 'all'}>
                  {group && (
                    <h3 className="group-title in-card">
                      {group}
                      <span className="muted"> {groupItems.filter((i) => i.checked).length}/{groupItems.length}</span>
                    </h3>
                  )}
                  <ul className="items">
                    {groupItems.map((item) => (
                      <ItemRow
                        key={item.key}
                        item={item}
                        onToggle={() => setData((d) => toggleChecked(d, trip.id, item.key))}
                        onMenu={() => setMenuItem(item)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              {catItems.length === 0 && <p className="muted pad small">{cat.empty}</p>}
              <AddOneOff onAdd={(text) => addExtra(cat.id, text)} />
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
                <button className="link" onClick={() => setHidden(t.id, false)}>Restore</button>
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
            onConfirm: () => { go({ name: 'trips' }); setData((d) => ({ ...d, trips: d.trips.filter((t) => t.id !== trip.id) })) },
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
                <button className="btn wide" onClick={() => { setHidden(menuItem.templateId, true); setMenuItem(null) }}>
                  Not needed this trip
                </button>
                <button className="btn wide" onClick={() => go({ name: 'master' })}>Edit in master list</button>
              </>
            ) : (
              <>
                <button className="btn primary wide" onClick={() => { setPromoting({ item: menuItem, when: [], requires: null }); setMenuItem(null) }}>
                  Add to master list…
                </button>
                <button className="btn danger-text wide" onClick={() => { deleteExtra(menuItem.extraId); setMenuItem(null) }}>
                  Remove from this trip
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}

      {promoting && (
        <Sheet title={`Add “${promoting.item.text}” to master list`} onClose={() => setPromoting(null)}>
          <ConditionPicker
            questions={data.questions}
            value={promoting.when}
            onChange={(when) => setPromoting((p) => ({ ...p, when }))}
          />
          <RequirePicker
            questions={data.questions}
            value={promoting.requires}
            onChange={(requires) => setPromoting((p) => ({ ...p, requires }))}
          />
          <div className="sheet-actions">
            <button className="btn" onClick={() => setPromoting(null)}>Cancel</button>
            <button
              className="btn primary"
              onClick={() => {
                setData((d) => makePermanent(d, trip.id, promoting.item.extraId, promoting.when, promoting.requires))
                setPromoting(null)
              }}
            >
              Add
            </button>
          </div>
        </Sheet>
      )}

      {confirm && <ConfirmSheet {...confirm} onClose={() => setConfirm(null)} />}
    </main>
  )
}
