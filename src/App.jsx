import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { loadAccountData, loadData, loadSyncState, saveAccountData, saveData, saveSyncState } from './storage'
import { syncReminders } from './reminders'
import { defaultData, refreshStarterList, todayStr } from './model'
import { TripsScreen } from './screens/TripsScreen'
import { TripScreen } from './screens/TripScreen'
import { TripForm } from './screens/TripForm'
import { MasterScreen } from './screens/MasterScreen'
import { HelpScreen } from './screens/HelpScreen'
import { DataBackupScreen } from './screens/DataBackupScreen'
import { SyncScreen } from './screens/SyncScreen'
import { ensureCloudData, firebaseConfigured, listenForCloudData, observeAuth, saveCloudData } from './firebase'

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(firebaseConfigured)
  const [cloudReady, setCloudReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState('Not connected')
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  const [failedUnownedSyncUid, setFailedUnownedSyncUid] = useState(null)
  // screen: trips | trip | tripForm | master | help | dataBackup | sync
  const [screen, setScreen] = useState({ name: 'trips' })
  const [today, setToday] = useState(todayStr())
  const loaded = useRef(false)
  const dataRef = useRef(null)
  const cloudDataRef = useRef(null)
  const cloudBaselineRef = useRef(null)
  const cloudDirtyRef = useRef(false)
  const localRevisionRef = useRef(0)
  const syncStateRef = useRef({ dirty: false, uid: null })
  const lastObservedDataRef = useRef(null)
  const cloudPendingWritesRef = useRef(0)
  const lastSentRef = useRef(null)
  const activeUserRef = useRef(null)
  const cloudSaveQueue = useRef(Promise.resolve())
  // Saves run one at a time, in order, so the newest data is always written
  // last. (Capacitor's bridge happens to serialize file writes today; this
  // keeps it true even if a plugin update makes writes concurrent.)
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    Promise.all([loadData(), loadSyncState()])
      .then(([d, syncState]) => {
        syncStateRef.current = syncState
        cloudDirtyRef.current = syncState.dirty
        loaded.current = true
        setData(d)
      })
      .catch((e) => setError(`Couldn't load your lists: ${e.message}`))
  }, [])

  useEffect(() => {
    if (dataRef.current !== data) localRevisionRef.current += 1
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (!firebaseConfigured) return
    return observeAuth((nextUser) => {
      activeUserRef.current = nextUser?.uid ?? null
      cloudDataRef.current = null
      cloudBaselineRef.current = null
      cloudPendingWritesRef.current = 0
      lastSentRef.current = null
      cloudSaveQueue.current = Promise.resolve()
      setUser(nextUser)
      setAuthLoading(false)
      setCloudReady(false)
      setSyncError('')
      setSyncStatus(nextUser ? 'Connecting…' : 'Not connected')
      if (!nextUser) setFailedUnownedSyncUid(null)
    })
  }, [])

  useEffect(() => {
    if (!firebaseConfigured || authLoading || !user || !data || !loaded.current) return
    let cancelled = false
    let stopListening
    setCloudReady(false)
    setSyncError('')
    setSyncStatus('Syncing…')
    void (async () => {
      try {
        const previousOwner = syncStateRef.current.uid
        const currentData = dataRef.current
        if (previousOwner && previousOwner !== user.uid) {
          await saveAccountData(
            previousOwner,
            currentData,
            syncStateRef.current.dirty,
          )
        }
        const accountCopy = await loadAccountData(user.uid)
        const ownsLocal = !previousOwner || previousOwner === user.uid || Boolean(accountCopy)
        // If this account was already active on this device, retain its current
        // local data. Signed-out edits are tracked persistently when they happen.
        const returningToSameAccount = previousOwner === user.uid
        const localData = returningToSameAccount
          ? currentData
          : (accountCopy?.data ?? (ownsLocal ? currentData : defaultData()))
        const localDirty = Boolean(accountCopy?.dirty || cloudDirtyRef.current || syncStateRef.current.dirty)
        const startingSerialized = JSON.stringify(localData)
        const startingRevision = localRevisionRef.current
        const preferLocal = Boolean(accountCopy?.dirty) || (returningToSameAccount && localDirty)
        cloudBaselineRef.current = startingSerialized

        const cloudData = await ensureCloudData(user, localData, preferLocal, ownsLocal)
        if (cancelled) return

        const normalized = refreshStarterList(cloudData ?? defaultData())
        const serialized = JSON.stringify(normalized)
        const localEditsDuringSync = localRevisionRef.current !== startingRevision
        // Preserve edits made during sync only when the same local list belongs
        // to this account and the cloud returned that exact starting list.
        const keepLocalEdits = localEditsDuringSync && localData === currentData && serialized === startingSerialized
        const finalData = keepLocalEdits ? dataRef.current : normalized
        const finalSerialized = JSON.stringify(finalData)
        cloudDataRef.current = serialized
        cloudBaselineRef.current = null
        cloudDirtyRef.current = keepLocalEdits && finalSerialized !== serialized
        syncStateRef.current = { dirty: cloudDirtyRef.current, uid: user.uid }
        await saveSyncState(syncStateRef.current)
        await saveAccountData(user.uid, finalData, cloudDirtyRef.current)
        if (cancelled) return
        setFailedUnownedSyncUid(null)
        setData((current) => JSON.stringify(current) === finalSerialized ? current : finalData)
        setCloudReady(true)
        setSyncStatus(cloudDirtyRef.current ? 'Saved on this device' : 'Up to date')
        stopListening = listenForCloudData(user, (remoteData) => {
          const next = refreshStarterList(remoteData)
          const remote = JSON.stringify(next)
          if (
            cloudDirtyRef.current || cloudPendingWritesRef.current > 0 ||
            JSON.stringify(dataRef.current) !== cloudDataRef.current
          ) {
            cloudDirtyRef.current = true
            return
          }
          if (remote !== cloudDataRef.current) {
            cloudDataRef.current = remote
            setData((current) => JSON.stringify(current) === remote ? current : next)
          }
          setSyncStatus('Up to date')
          setSyncError('')
        }, (syncFailure) => {
          setSyncStatus('Saved on this device')
          setSyncError(syncFailure.message || 'Cloud sync is unavailable. Your device copy is safe.')
        })
      } catch (syncFailure) {
        if (cancelled) return
        if (syncStateRef.current.uid === null) setFailedUnownedSyncUid(user.uid)
        setCloudReady(false)
        setSyncStatus('Saved on this device')
        setSyncError(syncFailure.message || 'Could not reach Firebase. Your device copy is safe.')
      }
    })()

    return () => {
      cancelled = true
      stopListening?.()
    }
  }, [authLoading, user?.uid, data === null, syncAttempt])

  useEffect(() => {
    if (!user || cloudReady || !cloudBaselineRef.current || !data) return
    if (JSON.stringify(data) !== cloudBaselineRef.current) {
      cloudDirtyRef.current = true
      syncStateRef.current = { ...syncStateRef.current, dirty: true }
      saveSyncState(syncStateRef.current).catch(() => {})
      if (syncStateRef.current.uid) {
        saveAccountData(syncStateRef.current.uid, data, true).catch(() => {})
      }
    }
  }, [data, user?.uid, cloudReady])

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

  // Persist an explicit dirty marker for changes made while signed out. Do
  // not infer this from the per-account copy: a cloud listener can legitimately
  // update the local list without rewriting that copy.
  useEffect(() => {
    if (!loaded.current || !data) return
    const serialized = JSON.stringify(data)
    const previousSerialized = lastObservedDataRef.current
    lastObservedDataRef.current = serialized
    if (
      previousSerialized === null || previousSerialized === serialized ||
      authLoading || user || !syncStateRef.current.uid
    ) return

    const uid = syncStateRef.current.uid
    const nextSyncState = { dirty: true, uid }
    cloudDirtyRef.current = true
    syncStateRef.current = nextSyncState
    // Queue the marker after the normal local-list save above, so a restart
    // won't see a dirty marker before this version of the list is persisted.
    saveQueue.current = saveQueue.current
      .then(() => saveSyncState(nextSyncState))
      .then(() => saveAccountData(uid, data, true))
      .catch(() => {})
  }, [data, authLoading, user?.uid])

  useEffect(() => {
    if (!data || !user || !cloudReady) return
    const serialized = JSON.stringify(data)
    const uid = user.uid

    function persistSnapshot(nextSerialized, alreadyPending = false) {
      if (!alreadyPending) cloudPendingWritesRef.current += 1
      cloudSaveQueue.current = cloudSaveQueue.current
        .catch(() => {})
        .then(() => {
          if (activeUserRef.current !== uid) return
          lastSentRef.current = nextSerialized
          return saveCloudData(user, JSON.parse(nextSerialized))
        })
        .then(async () => {
          if (activeUserRef.current !== uid) return
          cloudPendingWritesRef.current = Math.max(0, cloudPendingWritesRef.current - 1)
          cloudDataRef.current = nextSerialized
          const latestSerialized = JSON.stringify(dataRef.current)
          if (latestSerialized !== nextSerialized) {
            cloudDirtyRef.current = true
            if (cloudPendingWritesRef.current === 0) {
              persistSnapshot(latestSerialized)
            }
            return
          }
          if (cloudPendingWritesRef.current === 0) {
            cloudDirtyRef.current = false
            syncStateRef.current = { dirty: false, uid }
            await Promise.all([
              saveSyncState(syncStateRef.current),
              saveAccountData(uid, dataRef.current, false),
            ])
            setSyncStatus('Up to date')
            setSyncError('')
          }
        })
        .catch((syncFailure) => {
          if (activeUserRef.current !== uid) return
          cloudPendingWritesRef.current = Math.max(0, cloudPendingWritesRef.current - 1)
          cloudDirtyRef.current = true
          syncStateRef.current = { dirty: true, uid }
          saveSyncState(syncStateRef.current).catch(() => {})
          saveAccountData(uid, dataRef.current, true).catch(() => {})
          setSyncStatus('Saved on this device')
          setSyncError(syncFailure.message || 'Cloud sync is unavailable. Your device copy is safe.')
        })
    }

    if (serialized === cloudDataRef.current && cloudPendingWritesRef.current === 0) {
      if (cloudDirtyRef.current || syncStateRef.current.dirty) {
        cloudDirtyRef.current = false
        syncStateRef.current = { dirty: false, uid }
        saveSyncState(syncStateRef.current).catch(() => {})
        saveAccountData(uid, data, false).catch(() => {})
      }
      setSyncStatus('Up to date')
      setSyncError('')
      return
    }
    if (serialized === lastSentRef.current && cloudPendingWritesRef.current > 0) return

    cloudDirtyRef.current = true
    syncStateRef.current = { dirty: true, uid }
    saveSyncState(syncStateRef.current).catch(() => {})
    saveAccountData(uid, data, true).catch(() => {})
    setSyncStatus('Saving…')
    cloudPendingWritesRef.current += 1
    let timerFired = false
    const timer = window.setTimeout(() => {
      timerFired = true
      persistSnapshot(serialized, true)
    }, 350)
    return () => {
      clearTimeout(timer)
      if (!timerFired) {
        cloudPendingWritesRef.current = Math.max(0, cloudPendingWritesRef.current - 1)
      }
    }
  }, [data, user?.uid, cloudReady])

  useEffect(() => {
    if (!user) return
    const retry = () => setSyncAttempt((count) => count + 1)
    window.addEventListener('online', retry)
    let appStateSubscription
    if (Capacitor.isNativePlatform()) {
      appStateSubscription = CapApp.addListener('appStateChange', ({ isActive }) => isActive && retry())
    }
    return () => {
      window.removeEventListener('online', retry)
      appStateSubscription?.then((subscription) => subscription.remove())
    }
  }, [user?.uid])

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

  if (!data) {
    return <div className="app"><p className="muted pad">{error ?? 'Loading…'}</p></div>
  }

  const localOwner = syncStateRef.current.uid
  const firstSyncFailedWithUnownedLocalData =
    localOwner === null && failedUnownedSyncUid === user?.uid
  const accountSwitchPending = user && !cloudReady && localOwner !== user.uid && !firstSyncFailedWithUnownedLocalData
  if (accountSwitchPending) {
    return (
      <SyncScreen
        go={setScreen}
        user={user}
        authLoading={authLoading}
        syncStatus={syncStatus}
        syncError={syncError}
        hasUnsyncedChanges={cloudDirtyRef.current || cloudPendingWritesRef.current > 0}
        onRetry={() => setSyncAttempt((count) => count + 1)}
      />
    )
  }

  const go = setScreen
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
    body = (
      <SyncScreen
        go={go}
        user={user}
        authLoading={authLoading}
        syncStatus={syncStatus}
        syncError={syncError}
        hasUnsyncedChanges={cloudDirtyRef.current || cloudPendingWritesRef.current > 0}
        onRetry={() => setSyncAttempt((count) => count + 1)}
      />
    )
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
