import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { keepUnreadableData, loadData, saveData } from './storage'
import { syncReminders } from './reminders'
import { todayStr } from './model'
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
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  // screen: trips | trip | tripForm | master | help | dataBackup | sync
  const [screen, setScreen] = useState({ name: 'trips' })
  const [notice, setNotice] = useState('')
  const [today, setToday] = useState(todayStr())
  const loaded = useRef(false)

  useEffect(() => {
    loadData()
      .then((d) => {
        loaded.current = true
        setData(d)
      })
      .catch((e) => setLoadError(e.message || String(e)))
  }, [])

  useEffect(() => {
    if (!loaded.current) return
    // saveData queues its write right away (storage writes run in call order).
    saveData(data).catch((e) => setError(`Couldn't save: ${e.message}`))
    const timer = setTimeout(() => {
      syncReminders(data).catch((e) => setError(`Couldn't schedule reminders: ${e.message}`))
    }, 800)
    return () => clearTimeout(timer)
  }, [data])

  // Called after the save effect above, so each list's write is queued before
  // the unsynced marker the sync hook writes for it.
  const sync = useCloudSync(data, setData)

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
    loaded.current = true
    setLoadError(null)
    setData(restored)
  }

  if (!data) {
    return (
      <div className="app">
        {loadError
          ? <LoadFailedScreen message={loadError} onRestore={restoreAfterLoadFailure} />
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
    body = <DataBackupScreen {...props} />
  } else if (screen.name === 'sync') {
    body = <SyncScreen go={go} onAuthenticated={finishGoogleSignIn} {...sync} />
  } else {
    body = <TripsScreen {...props} user={sync.user} authLoading={sync.authLoading} />
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
