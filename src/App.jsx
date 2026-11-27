import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { keepUnreadableData, loadWorkspace, saveWorkspace } from './storage'
import { recoverWorkspace } from './syncState'
import { syncReminders } from './reminders'
import { newId, todayStr } from './model'
import { TripsScreen } from './screens/TripsScreen'
import { TripScreen } from './screens/TripScreen'
import { TripForm } from './screens/TripForm'
import { MasterScreen } from './screens/MasterScreen'
import { HelpScreen } from './screens/HelpScreen'
import { DataBackupScreen } from './screens/DataBackupScreen'
import { SyncScreen } from './screens/SyncScreen'
import { LoadFailedScreen } from './screens/LoadFailedScreen'
import { useCloudSync } from './useCloudSync.jsx'

const TRIPS = { name: 'trips' }
const SCREEN_KEY = 'travellist-screen'

function pageToRemember(screen) {
  if (screen?.name !== 'tripForm') return screen
  return screen.id === undefined ? TRIPS : { name: 'trip', id: screen.id }
}

function loadScreen() {
  try {
    return pageToRemember(JSON.parse(localStorage.getItem(SCREEN_KEY)))
  } catch {
    return null
  }
}

function saveScreen(screen) {
  try {
    const { name, id, returnTo } = pageToRemember(screen)
    // Remember the page and its back destination. Editor sheets close on relaunch.
    const back = returnTo?.name === 'trip' ? { name: 'trip', id: returnTo.id } : undefined
    localStorage.setItem(SCREEN_KEY, JSON.stringify({ name, id, returnTo: back }))
  } catch {
    // The app can still navigate when device storage is unavailable.
  }
}

function resolveScreen(screen, data) {
  switch (screen?.name) {
    case 'trip':
      return data.trips.some((trip) => trip.id === screen.id) ? screen : TRIPS
    case 'tripForm':
    case 'master':
    case 'help':
    case 'dataBackup':
    case 'sync':
      return screen
    default:
      return TRIPS
  }
}

export default function App() {
  const [workspace, setWorkspace] = useState(null)
  const workspaceRef = useRef(null)
  const data = workspace?.data ?? null
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tabWaiting, setTabWaiting] = useState(false)
  const [requestedScreen, go] = useState(null)
  const ready = data !== null
  const screen = ready ? resolveScreen(requestedScreen, data) : TRIPS
  if (ready && screen !== requestedScreen) go(screen)
  const [notice, setNotice] = useState('')
  const [today, setToday] = useState(todayStr())
  const updateWorkspace = useCallback((update) => {
    const previous = workspaceRef.current
    const next = update(previous)
    if (next === previous) return Promise.resolve()
    workspaceRef.current = next
    setWorkspace(next)
    const saved = saveWorkspace(next, next.data !== previous?.data)
    saved.catch((e) => setError(`Couldn't save: ${e.message}`))
    return saved
  }, [])

  // Run edits synchronously against the latest workspace, even before it has rendered.
  const setData = (update) => updateWorkspace((current) => {
    const updated = update(current.data)
    return updated === current.data ? current : { ...current, data: updated }
  })
  const restoreBackup = (restored) => updateWorkspace((current) => ({
    data: restored,
    sync: { ...current.sync, replacement: current.sync.uid ? newId() : null },
  }))

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const savedScreen = loadScreen()
        go((current) => current ?? savedScreen)
        const loaded = await loadWorkspace()
        if (!controller.signal.aborted) void updateWorkspace(() => loaded)
      } catch (e) {
        if (!controller.signal.aborted) setLoadError(e.message || String(e))
      }
    }
    if (Capacitor.isNativePlatform() || !navigator.locks) {
      void load()
      return () => controller.abort()
    }

    // The browser's draft and pending batch live in one origin-wide file.
    // Hold the writer lock until this tab closes, then load in the waiting tab.
    let release
    const hold = new Promise((resolve) => { release = resolve })
    setTabWaiting(true)
    navigator.locks.request('travellist-workspace', { signal: controller.signal }, async () => {
      if (controller.signal.aborted) return
      setTabWaiting(false)
      await load()
      await hold
    }).catch((e) => {
      if (!controller.signal.aborted) {
        setTabWaiting(false)
        setLoadError(e.message || String(e))
      }
    })
    return () => { controller.abort(); release() }
  }, [updateWorkspace])

  useEffect(() => {
    if (!data) return
    const timer = setTimeout(() => {
      syncReminders(data).catch((e) => setError(`Couldn't schedule reminders: ${e.message}`))
    }, 800)
    return () => clearTimeout(timer)
  }, [data])

  const sync = useCloudSync(workspace, workspaceRef, updateWorkspace)

  // "Today" decides when Coming Home starts, so refresh it when the app returns.
  useEffect(() => {
    const refreshToday = () => setToday(todayStr())
    const timer = window.setInterval(refreshToday, 60_000)
    const refreshOnVisible = () => { if (document.visibilityState === 'visible') refreshToday() }
    document.addEventListener('visibilitychange', refreshOnVisible)
    if (!Capacitor.isNativePlatform()) {
      return () => {
        window.clearInterval(timer)
        document.removeEventListener('visibilitychange', refreshOnVisible)
      }
    }
    const subs = [
      CapApp.addListener('appStateChange', ({ isActive }) => isActive && refreshToday()),
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        const tripId = notification.extra?.tripId
        if (tripId) go({ name: 'trip', id: tripId })
      }),
    ]
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshOnVisible)
      subs.forEach((p) => p.then((s) => s.remove()))
    }
  }, [])

  useEffect(() => {
    if (ready) saveScreen(screen)
    window.scrollTo(0, 0) // returns a Promise in newer Chrome; don't hand it to React
  }, [ready, screen])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  // Copy the unreadable list aside first; if that fails, nothing is replaced.
  const restoreAfterLoadFailure = async (restored) => {
    try {
      await keepUnreadableData()
    } catch (e) {
      throw new Error(`Couldn't keep a copy of the list that failed to load, so nothing was replaced: ${e.message}`)
    }
    const recovered = recoverWorkspace(restored, sync.user)
    await saveWorkspace(recovered)
    workspaceRef.current = recovered
    setWorkspace(recovered)
    setLoadError(null)
  }

  if (!data) {
    if (tabWaiting) return (
      <main className="app"><p className="pad">TravelList is open in another tab. Close it to continue here.</p></main>
    )
    return (
      <div className="app">
        {loadError
          ? <LoadFailedScreen message={loadError} onRestore={restoreAfterLoadFailure} user={sync.user} authLoading={sync.authLoading} />
          : <p className="muted pad">Loading…</p>}
      </div>
    )
  }

  const finishGoogleSignIn = () => {
    setNotice('Signed in with Google')
    go({ name: 'trips' })
  }
  const props = { data, setData, go, today }
  let body
  if (screen.name === 'trip') {
    body = <TripScreen {...props} key={screen.id} tripId={screen.id} />
  } else if (screen.name === 'tripForm') {
    body = <TripForm {...props} tripId={screen.id} />
  } else if (screen.name === 'master') {
    const returnTrip = screen.returnTo?.name === 'trip' && data.trips.find((trip) => trip.id === screen.returnTo.id)
    const returnTo = returnTrip ? { name: 'trip', id: returnTrip.id, label: returnTrip.name || 'Trip' } : undefined
    body = <MasterScreen {...props} itemId={screen.itemId} returnTo={returnTo} />
  } else if (screen.name === 'help') {
    body = <HelpScreen go={go} />
  } else if (screen.name === 'dataBackup') {
    body = <DataBackupScreen data={data} restoreBackup={restoreBackup} go={go} />
  } else if (screen.name === 'sync') {
    body = <SyncScreen go={go} onAuthenticated={finishGoogleSignIn} {...sync} />
  } else {
    body = <TripsScreen {...props} user={sync.user} authLoading={sync.authLoading} ownerEmail={sync.ownerEmail} />
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="success-banner" role="status">
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}
      {body}
    </div>
  )
}
