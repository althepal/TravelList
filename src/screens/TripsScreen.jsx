import { Capacitor } from '@capacitor/core'
import { formatRange, isComingHome, nightsOf, parseDate, tripItems, tripStatus } from '../model'

function statusText(trip, today) {
  const status = tripStatus(trip, today)
  if (status === 'past') return 'Done'
  if (isComingHome(trip, today)) return 'Coming home'
  if (status === 'active') return 'On the trip'
  const days = Math.round((parseDate(trip.start) - parseDate(today)) / 86400000)
  return days === 1 ? 'Tomorrow' : `In ${days} days`
}

function TripCard({ data, trip, today, go }) {
  const items = tripItems(data, trip)
  const done = items.filter((i) => i.checked).length
  const nights = nightsOf(trip)
  const status = statusText(trip, today)
  return (
    <button className="card trip-card" onClick={() => go({ name: 'trip', id: trip.id })}>
      <div className="trip-card-main">
        <strong>{trip.name || 'Untitled trip'}</strong>
        <span className="muted small">
          {formatRange(trip)} · {nights === 0 ? 'day trip' : `${nights} night${nights > 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="trip-card-side">
        <span className={`status ${status === 'Coming home' ? 'home' : ''}`}>{status}</span>
        <span className="muted small">{done}/{items.length}</span>
      </div>
    </button>
  )
}

export function TripsScreen({ data, go, today }) {
  const current = data.trips.filter((t) => !t.ended).sort((a, b) => a.start.localeCompare(b.start))
  const past = data.trips.filter((t) => t.ended).sort((a, b) => b.start.localeCompare(a.start))
  return (
    <main>
      <header className="hero">
        <h1>TravelList</h1>
        <button className="btn primary" onClick={() => go({ name: 'tripForm' })}>+ New trip</button>
      </header>

      <section>
        <h2 className="section-title">Trips</h2>
        {current.length === 0 && (
          <p className="muted empty">No trips planned. Start one and the list builds itself from your answers.</p>
        )}
        <div className="stack">
          {current.map((t) => <TripCard key={t.id} data={data} trip={t} today={today} go={go} />)}
        </div>
      </section>

      <section>
        <h2 className="section-title">Settings</h2>
        <div className="card list">
          <button className="list-row" onClick={() => go({ name: 'master' })}>
            <span>Master list & questions</span><span className="muted">{data.templates.length} items ›</span>
          </button>
          <button className="list-row" onClick={() => go({ name: 'dataBackup' })}>
            <span>Data & backup</span><span className="muted">Import or export ›</span>
          </button>
          <button className="list-row" onClick={() => go({ name: 'sync' })}>
            <span>Sync between devices</span><span className="muted">Account ›</span>
          </button>
          {Capacitor.isNativePlatform() && (
            <button className="list-row" onClick={() => go({ name: 'help' })}>
              <span>Car reminders setup</span><span className="muted">›</span>
            </button>
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="section-title">Past trips</h2>
          <div className="stack">
            {past.map((t) => <TripCard key={t.id} data={data} trip={t} today={today} go={go} />)}
          </div>
        </section>
      )}
    </main>
  )
}
