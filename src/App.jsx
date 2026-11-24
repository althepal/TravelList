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

export default function App() {
  const [workspace, setWorkspace] = useState(null)
  const workspaceRef = useRef(null)
  const data = workspace?.data ?? null
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [tabWaiting, setTabWaiting] = useState(false)
  // screen: trips | trip | tripForm | master | help | dataBackup | sync
  const [screen, setScreen] = useState({ name: 'trips' })
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
        if (tripId) setScreen({ name: 'trip', id: tripId })
      }),
    ]
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshOnVisible)
      subs.forEach((p) => p.then((s) => s.remove()))
    }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0) // returns a Promise in newer Chrome; don't hand it to React
  }, [screen])

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

  const go = setScreen
  const finishGoogleSignIn = () => {
    setNotice('Signed in with Google')
    go({ name: 'trips' })
  }
  const props = { data, setData, go, today }
  let body
  if (screen.name === 'trip' && data.trips.some((t) => t.id === screen.id)) {
    body = <TripScreen {...props} tripId={screen.id} />
  } else if (screen.name === 'tripForm') {
    body = <TripForm {...props} tripId={screen.id} />
  } else if (screen.name === 'master') {
    body = <MasterScreen {...props} itemId={screen.itemId} returnTo={screen.returnTo} />
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
