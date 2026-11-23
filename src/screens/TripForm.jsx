import { useState } from 'react'
import { TopBar } from '../components'
import { newTrip, nightsLabel, nightsOf, saveTrip, tripConditions } from '../model'

export function TripForm({ data, setData, go, today, tripId }) {
  const existing = data.trips.find((t) => t.id === tripId)
  const [trip, setTrip] = useState(() => {
    const initial = existing ?? newTrip(today)
    return {
      ...initial,
      answers: Object.fromEntries(data.questions.map((q) => [q.id, initial.answers[q.id] ?? false])),
    }
  })
  const set = (patch) => setTrip((t) => ({ ...t, ...patch }))
  const setAnswer = (qid, v) => setTrip((t) => ({ ...t, answers: { ...t.answers, [qid]: v } }))

  const datesValid = trip.start && trip.end && trip.end >= trip.start
  // Every question needs an explicit answer: a missed "Bringing Max?" shouldn't silently mean no.
  // Follow-up questions appear as answers come in, e.g. Swimming? after Flying: yes.
  const conditions = datesValid ? tripConditions(trip, data.questions) : null
  const asked = data.questions.filter((q) => conditions ? conditions.isAsked(q) : q.askIf.length === 0)
  const unanswered = asked.filter((q) => typeof trip.answers[q.id] !== 'boolean')
  const ready = datesValid && unanswered.length === 0
  const nights = datesValid ? nightsOf(trip) : 0
  const back = () => go(existing ? { name: 'trip', id: trip.id } : { name: 'trips' })

  const save = (e) => {
    e.preventDefault()
    if (!ready) return
    const saved = { ...trip, name: trip.name.trim() }
    setData((d) => saveTrip(d, saved))
    go({ name: 'trip', id: saved.id })
  }

  return (
    <main>
      <TopBar title={existing ? 'Edit trip' : 'New trip'} onBack={back} backLabel="Cancel" />
      <form onSubmit={save}>
        <section>
          <div className="card form-card">
            <label className="field">
              <span>Where to?</span>
              <input
                value={trip.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Tahoe, Mom's, Chicago work trip…"
                autoFocus={!existing}
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
                    set(trip.end < start ? { start, end: start } : { start })
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>Back</span>
                <input type="date" value={trip.end} min={trip.start} onChange={(e) => set({ end: e.target.value })} required />
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
            {existing ? 'Save' : 'Make my list'}
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
