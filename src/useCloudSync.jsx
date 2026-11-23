// The .jsx extension lets Vite track hook changes during React Fast Refresh.
import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { defaultData } from './model'
import { parseData } from './parseData'
import { loadSyncState, saveSyncState } from './storage'
import { ensureCloudData, firebaseConfigured, listenForCloudData, observeAuth, saveCloudData } from './firebase'

const OFFLINE = 'Saved on this device'
const failure = (e) => {
  if (e?.code === 'newer') return 'Your list was saved by a newer version of TravelList. Update the app to keep syncing.'
  if (e?.name === 'DataError') return `The cloud copy couldn't be used: ${e.message} Your device copy is safe.`
  return e?.message || 'Cloud sync is unavailable. Your device copy is safe.'
}

// Each device syncs with one Google account at a time (its owner, kept in the
// sync state). Signing in with a different account drops this device's list
// and uses that account's cloud copy, or the starter list if it has none.
//
// The one rule: when the list differs from the last copy read from or written
// to the cloud, it needs uploading. The saved `dirty` flag remembers that
// across launches and sign-outs, so the next sign-in uploads the device list
// instead of replacing it with the cloud copy.
export function useCloudSync(data, setData) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(firebaseConfigured)
  const [stateLoaded, setStateLoaded] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [status, setStatus] = useState('Not connected')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saveCount, setSaveCount] = useState(0)
  const [unsynced, setUnsynced] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState(null)
  const syncState = useRef({ uid: null, email: null, dirty: false })
  const dataRef = useRef(data)
  const cloudJson = useRef(null)
  const lastJson = useRef(null)
  const session = useRef(0) // bumps on every sign-in/out so late saves are ignored
  dataRef.current = data

  const writeSyncState = (changes) => {
    syncState.current = { ...syncState.current, ...changes }
    setUnsynced(syncState.current.dirty)
    setOwnerEmail(syncState.current.email)
    saveSyncState(syncState.current).catch(() => {})
  }
  const setDirty = (dirty) => {
    if (syncState.current.dirty !== dirty) writeSyncState({ dirty })
  }
  const retry = () => setAttempt((n) => n + 1)

  useEffect(() => {
    loadSyncState()
      .then((state) => {
        syncState.current = state
        setUnsynced(state.dirty)
        setOwnerEmail(state.email)
        setStateLoaded(true)
      })
      .catch((e) => setError(`Couldn't read sync settings: ${e.message}`))
  }, [])

  useEffect(() => {
    if (!firebaseConfigured) return
    return observeAuth((nextUser) => {
      session.current += 1
      cloudJson.current = null
      setUser(nextUser)
      setAuthLoading(false)
      setCloudReady(false)
      setError('')
      setStatus(nextUser ? 'Connecting…' : 'Not connected')
    })
  }, [])

  // Sign-in: fetch (or upload) the list and start listening for changes from
  // other devices.
  const hasData = data !== null
  useEffect(() => {
    if (!user || !hasData || !stateLoaded) return
    // A different account from the one this device last synced with: nothing
    // on this device belongs to it, so start from its cloud copy, or from the
    // starter list if it has none. Until that finishes, nothing is uploaded.
    const switching = Boolean(syncState.current.uid) && syncState.current.uid !== user.uid
    let cancelled = false
    let stopListening
    setCloudReady(false)
    setError('')
    setStatus('Syncing…')
    void (async () => {
      try {
        const startJson = JSON.stringify(dataRef.current)
        const local = switching ? defaultData() : dataRef.current
        const cloud = parseData(await ensureCloudData(user, local, !switching && syncState.current.dirty))
        if (cancelled) return
        const json = JSON.stringify(cloud)
        cloudJson.current = json
        writeSyncState({ uid: user.uid, email: user.email, dirty: false })
        // Edits made during the sync are kept only if the cloud kept the
        // starting list; the save effect then uploads them.
        if (json !== startJson) setData(cloud)
        setCloudReady(true)
        stopListening = listenForCloudData(user, (remote) => {
          let next
          try {
            next = parseData(remote)
          } catch (e) {
            // Stop uploading: local changes must not overwrite a copy this
            // build can't read. Retrying runs the sign-in check again.
            setCloudReady(false)
            setStatus(OFFLINE)
            setError(failure(e))
            return
          }
          // Local changes not uploaded yet win; they'll overwrite the cloud.
          if (JSON.stringify(dataRef.current) !== cloudJson.current) return
          const nextJson = JSON.stringify(next)
          cloudJson.current = nextJson
          setData((current) => JSON.stringify(current) === nextJson ? current : next)
          setStatus('Up to date')
          setError('')
        }, (e) => {
          setStatus(OFFLINE)
          setError(failure(e))
        })
      } catch (e) {
        if (cancelled) return
        setStatus(OFFLINE)
        setError(failure(e))
      }
    })()
    return () => {
      cancelled = true
      stopListening?.()
    }
  }, [user?.uid, hasData, stateLoaded, attempt])

  // Every list change: mark it unsynced and, when connected, upload it.
  // A finished upload bumps saveCount, which re-runs this to send the list
  // again if it changed while that upload was in flight.
  useEffect(() => {
    if (!data || !stateLoaded) return
    const json = JSON.stringify(data)
    const changed = lastJson.current !== null && lastJson.current !== json
    lastJson.current = json
    const connected = user && cloudReady
    if (json === cloudJson.current) {
      if (connected) {
        setDirty(false)
        setStatus('Up to date')
        setError('')
      }
      return
    }
    if (syncState.current.uid && (changed || connected)) setDirty(true)
    if (!connected) return
    setStatus('Saving…')
    const mySession = session.current
    const timer = setTimeout(() => {
      saveCloudData(user, data).then(() => {
        if (session.current !== mySession) return
        cloudJson.current = json
        setSaveCount((n) => n + 1)
      }, (e) => {
        if (session.current !== mySession) return
        setStatus(OFFLINE)
        setError(failure(e))
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [data, stateLoaded, user?.uid, cloudReady, saveCount])

  // Try again when the connection or the app comes back.
  useEffect(() => {
    if (!user) return
    window.addEventListener('online', retry)
    const sub = Capacitor.isNativePlatform()
      ? CapApp.addListener('appStateChange', ({ isActive }) => isActive && retry())
      : null
    return () => {
      window.removeEventListener('online', retry)
      sub?.then((s) => s.remove())
    }
  }, [user?.uid])

  return {
    user,
    authLoading,
    syncStatus: status,
    syncError: error,
    hasUnsyncedChanges: unsynced,
    ownerEmail,
    retry,
  }
}
