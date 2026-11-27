import { useRef, useState } from 'react'
import { TopBar } from '../components'
import { newTrip, nightsLabel, nightsOf, saveTrip, tripConditions, updateTrip } from '../model'
import { mergeTrip } from '../mergeData'

const validDates = (start, end) => start && end && end >= start

export function TripForm({ data, setData, go, today, tripId }) {
  const isEditing = tripId !== undefined
  const existing = data.trips.find((t) => t.id === tripId)
  const [initial] = useState(() => existing ?? newTrip(today))
  const [trip, setTrip] = useState(() => ({
    ...initial,
    answers: Object.fromEntries(data.questions.map((q) => [q.id, initial.answers[q.id] ?? false])),
  }))
  const answered = useRef(new Set())
  const [lastValidDates, setLastValidDates] = useState(() => ({ start: initial.start, end: initial.end }))
  const set = (patch) => setTrip((t) => ({ ...t, ...patch }))
  const setDates = (start, end) => {
    set({ start, end })
    if (validDates(start, end)) setLastValidDates({ start, end })
  }
  const setAnswer = (qid, v) => {
    answered.current.add(qid)
    setTrip((t) => ({ ...t, answers: { ...t.answers, [qid]: v } }))
  }

  const datesValid = validDates(trip.start, trip.end)
  // Every question needs an explicit answer: a missed "Bringing Max?" shouldn't silently mean no.
  // Follow-up questions appear as answers come in, e.g. Swimming? after Flying: yes.
  const conditions = tripConditions(datesValid ? trip : { ...trip, ...lastValidDates }, data.questions)
  const asked = data.questions.filter(conditions.isAsked)
  const unanswered = asked.filter((q) => typeof trip.answers[q.id] !== 'boolean')
  const ready = datesValid && unanswered.length === 0
  const nights = datesValid ? nightsOf(trip) : 0
  const back = () => go(existing ? { name: 'trip', id: trip.id } : { name: 'trips' })

  const save = (e) => {
    e.preventDefault()
    if (!ready) return
    // A question the form didn't show (Auto yes, or not asked) keeps an earlier
    // answer but doesn't save its pre-filled No: if it's asked later, the trip
    // should ask for an answer instead of assuming one.
    const shown = new Set(asked.map((q) => q.id))
    const answers = Object.fromEntries(Object.entries(trip.answers).filter(([id]) =>
      shown.has(id) || Object.hasOwn(initial.answers, id) || answered.current.has(id)))
    const saved = { ...trip, name: trip.name.trim(), answers }
    setData((d) => {
      // Saving explicitly restores a trip that sync deleted during editing.
      if (!isEditing || !d.trips.some((t) => t.id === tripId)) return saveTrip(d, saved)
      return updateTrip(d, tripId, (current) => {
        // A default answer was never selected, so keep a newer cloud answer.
        const defaults = d.questions.filter(({ id }) => !Object.hasOwn(initial.answers, id) &&
          !answered.current.has(id) && Object.hasOwn(current.answers, id))
        const before = { ...initial, answers: { ...initial.answers, ...Object.fromEntries(defaults.map(({ id }) => [id, saved.answers[id]])) } }
        return mergeTrip(before, saved, current)
      })
    })
    go({ name: 'trip', id: saved.id })
  }

  return (
    <main>
      <TopBar title={isEditing ? 'Edit trip' : 'New trip'} onBack={back} backLabel="Cancel" />
      <form onSubmit={save}>
        <section>
          <div className="card form-card">
            <label className="field">
              <span>Where to?</span>
              <input
                value={trip.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Tahoe, Mom's, Chicago work trip…"
                autoFocus={!isEditing}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Leaving</span>
                <input
                  type="date"
                  value={trip.start}
                  onChange={(e) => {
                    const start = e.target.value
                    setDates(start, trip.end < start ? start : trip.end)
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>Back</span>
                <input type="date" value={trip.end} min={trip.start} onChange={(e) => setDates(trip.start, e.target.value)} required />
              </label>
            </div>
            <p className="muted small">
              {datesValid
                ? nights === 0 ? 'Day trip.' : `${nightsLabel(trip)}. Coming Home reminders start on the last day.`
                : 'The return date must be on or after the leaving date.'}
            </p>
          </div>
        </section>

        <section>
          <h2 className="section-title">About this trip</h2>
          <div className="card list">
            {asked.map((q) => (
              <div key={q.id} className={`question-row ${typeof trip.answers[q.id] === 'boolean' ? '' : 'unanswered'}`}>
                <span>{q.text}</span>
                <div className="yesno" role="group" aria-label={q.text}>
                  {[true, false].map((v) => (
                    <button
                      type="button"
                      key={String(v)}
                      className={trip.answers[q.id] === v ? 'on' : ''}
                      aria-pressed={trip.answers[q.id] === v}
                      onClick={() => setAnswer(q.id, v)}
                    >
                      {v ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {data.questions.length === 0 && <p className="muted pad">No questions yet. Add them in the master list.</p>}
          </div>
        </section>

        <section>
          <button type="submit" className="btn primary wide" disabled={!ready}>
            {isEditing ? 'Save' : 'Make my list'}
          </button>
          {datesValid && unanswered.length > 0 && (
            <p className="muted small center">
              Answer {unanswered.length === 1 ? `“${unanswered[0].text}”` : `${unanswered.length} questions`} to continue.
            </p>
          )}
        </section>
      </form>
    </main>
  )
}
