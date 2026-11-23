import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ConfirmSheet, Sheet, TopBar } from '../components'
import {
  addExtra, CATEGORIES, deleteTrip, formatRange, groupPackItems, isComingHome, makePermanent, newTemplate, nightsLabel,
  removeExtra, setHidden, toggleChecked, tripConditions, tripItems, updateTrip,
} from '../model'
import { TemplateSheet } from './TemplateSheet'

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
      <button className="item-check" onClick={onToggle} role="checkbox" aria-checked={item.checked}>
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
  const [hideCompleted, setHideCompleted] = useState(false)
  const [menuItem, setMenuItem] = useState(null)
  const [promoting, setPromoting] = useState(null) // { extraId, template }
  const [confirm, setConfirm] = useState(null)

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
        const visibleCatItems = hideCompleted ? catItems.filter((i) => !i.checked) : catItems
        const catDone = catItems.filter((i) => i.checked).length
        const groups = cat.id === 'pack'
          ? groupPackItems(catItems)
            .map((group) => ({
              ...group,
              visibleItems: hideCompleted ? group.items.filter((i) => !i.checked) : group.items,
            }))
            .filter((group) => group.visibleItems.length > 0)
          : [{ group: null, items: catItems, visibleItems: visibleCatItems }]
        return (
          <section key={cat.id} className="category">
            <h2 className="section-title">
              {cat.label}
              {catItems.length > 0 && <span className="muted"> {catDone}/{catItems.length}</span>}
            </h2>
            <div className="card">
              {groups.map(({ group, items: allGroupItems, visibleItems: groupItems }) => (
                <div key={group ?? 'all'}>
                  {group && (
                    <h3 className="group-title in-card">
                      {group}
                      <span className="muted"> {allGroupItems.filter((i) => i.checked).length}/{allGroupItems.length}</span>
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
              {catItems.length === 0
                ? <p className="muted pad small">{cat.empty}</p>
                : visibleCatItems.length === 0 && <p className="muted pad small">All {catDone} completed items are hidden.</p>}
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
