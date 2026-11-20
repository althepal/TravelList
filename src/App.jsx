import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { loadData, saveData } from './storage'
import { syncReminders } from './reminders'
import { todayStr } from './model'
import { TripsScreen } from './screens/TripsScreen'
import { TripScreen } from './screens/TripScreen'
import { TripForm } from './screens/TripForm'
import { MasterScreen } from './screens/MasterScreen'
import { HelpScreen } from './screens/HelpScreen'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // screen: {name:'trips'} | {name:'trip', id} | {name:'tripForm', id?} | {name:'master'} | {name:'help'}
  const [screen, setScreen] = useState({ name: 'trips' })
  const [today, setToday] = useState(todayStr())
  const loaded = useRef(false)
  // Saves run one at a time, in order, so the newest data is always written
  // last. (Capacitor's bridge happens to serialize file writes today; this
  // keeps it true even if a plugin update makes writes concurrent.)
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    loadData()
      .then((d) => { loaded.current = true; setData(d) })
      .catch((e) => setError(`Couldn't load your lists: ${e.message}`))
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    // The catch keeps the queue going after a failed save.
    saveQueue.current = saveQueue.current
      .then(() => saveData(data))
      .catch((e) => setError(`Couldn't save: ${e.message}`))
    const timer = setTimeout(() => {
      syncReminders(data).catch((e) => setError(`Couldn't schedule reminders: ${e.message}`))
    }, 800)
    return () => clearTimeout(timer)
  }, [data])

  // "Today" decides when Coming Home starts, so refresh it when the app returns.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const subs = [
      CapApp.addListener('appStateChange', ({ isActive }) => isActive && setToday(todayStr())),
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const tripId = notification.extra?.tripId
        if (tripId) setScreen({ name: 'trip', id: tripId })
      }),
    ]
    return () => subs.forEach((p) => p.then((s) => s.remove()))
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0) // returns a Promise in newer Chrome; don't hand it to React
  }, [screen])

  if (!data) {
    return <div className="app"><p className="muted pad">{error ?? 'Loading…'}</p></div>
  }

  const go = setScreen
  const props = { data, setData, go, today }
  let body
  if (screen.name === 'trip' && data.trips.some((t) => t.id === screen.id)) {
    body = <TripScreen {...props} tripId={screen.id} />
  } else if (screen.name === 'tripForm') {
    body = <TripForm {...props} tripId={screen.id} />
  } else if (screen.name === 'master') {
    body = <MasterScreen {...props} />
  } else if (screen.name === 'help') {
    body = <HelpScreen go={go} />
  } else {
    body = <TripsScreen {...props} />
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {body}
    </div>
  )
}
