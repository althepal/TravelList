import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { defaultData } from './model'
import { parseData } from './parseData'
import { saveWorkspace } from './storage'
import { acknowledgeBatch, acceptCloud, hasUnsyncedChanges, prepareBatch } from './syncState'
import { ensureCloudData, firebaseConfigured, listenForCloudData, observeAuth, saveCloudData } from './firebase'

const OFFLINE = 'Saved on this device'
const RETRYABLE = new Set(['aborted', 'deadline-exceeded', 'unavailable'])

function failure(error) {
  if (error?.code === 'newer') return 'Your list was saved by a newer version of TravelList. Update the app to keep syncing.'
  if (error?.name === 'DataError') return `The cloud copy couldn't be used: ${error.message} Your device copy is safe.`
  return error?.message || 'Cloud sync is unavailable. Your device copy is safe.'
}

export function useCloudSync(workspace, workspaceRef, updateWorkspace) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(firebaseConfigured)
  const [connection, setConnection] = useState(null)
  const [status, setStatus] = useState('Not connected')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const authUser = useRef(null)
  const ready = Boolean(connection && connection.user === user && connection.attempt === attempt)
  const loaded = Boolean(workspace)
  const pending = workspace?.sync.pending
  const unsynced = loaded && hasUnsyncedChanges(workspace)

  const retry = () => setAttempt((current) => current + 1)
  const showError = (cause) => {
    setStatus(OFFLINE)
    setError(cause)
  }

  useEffect(() => {
    if (!firebaseConfigured) return
    return observeAuth((nextUser) => {
      authUser.current = nextUser
      setUser(nextUser)
      setAuthLoading(false)
      setConnection(null)
      setError(null)
      setStatus(nextUser ? 'Connecting…' : 'Not connected')
    })
  }, [])

  useEffect(() => {
    if (!user || !loaded) return
    const started = workspaceRef.current
    const switching = Boolean(started.sync.uid && started.sync.uid !== user.uid)
    let active = true
    setError(null)
    setStatus('Syncing…')
    void (async () => {
      try {
        const { data: cloud, restoreId } = await ensureCloudData(user, switching ? defaultData() : started.data)
        if (!active || authUser.current !== user) return
        await updateWorkspace((current) => acceptCloud(current, cloud, user, started.data, restoreId))
        if (!active || authUser.current !== user) return
        setConnection({ user, attempt })
        setStatus(hasUnsyncedChanges(workspaceRef.current) ? 'Saving…' : 'Up to date')
      } catch (cause) {
        if (active && authUser.current === user) showError(cause)
      }
    })()
    return () => { active = false }
  }, [user, loaded, attempt, updateWorkspace, workspaceRef])

  // Listen when there is no in-flight batch. Re-subscribing after an ack
  // reads any server changes that arrived while the batch was being sent.
  useEffect(() => {
    if (!ready || pending) return
    return listenForCloudData(user, ({ data: remote, restoreId }) => {
      if (authUser.current !== user || workspaceRef.current.sync.pending) return
      try {
        const cloud = parseData(remote)
        updateWorkspace((current) => acceptCloud(current, cloud, user, current.data, restoreId)).catch(showError)
        setError(null)
        setStatus(hasUnsyncedChanges(workspaceRef.current) ? 'Saving…' : 'Up to date')
      } catch (cause) {
        setConnection(null)
        showError(cause)
      }
    }, showError)
  }, [ready, pending, user, updateWorkspace, workspaceRef])

  useEffect(() => {
    if (!ready || !unsynced || pending) return
    setStatus('Saving…')
    const timer = setTimeout(() => {
      if (authUser.current === user) void updateWorkspace(prepareBatch)
    }, 350)
    return () => clearTimeout(timer)
  }, [ready, unsynced, pending, user, workspace, updateWorkspace])

  useEffect(() => {
    if (!ready || !pending) return
    let active = true
    const draft = workspaceRef.current
    setStatus('Saving…')
    setError(null)
    void (async () => {
      try {
        // The batch ID and its baseline must survive a crash between the
        // server commit and our acknowledgement.
        await saveWorkspace(draft, false)
        if (!active || authUser.current !== user) return
        const { data: cloud, restoreId } = await saveCloudData(user, draft.sync)
        if (!active || authUser.current !== user) return
        await updateWorkspace((current) => acknowledgeBatch(current, pending, cloud, restoreId))
        if (active && authUser.current === user) {
          setStatus(hasUnsyncedChanges(workspaceRef.current) ? 'Saving…' : 'Up to date')
        }
      } catch (cause) {
        if (active && authUser.current === user) showError(cause)
      }
    })()
    return () => { active = false }
  }, [ready, pending, user, updateWorkspace, workspaceRef])

  // A retry reuses any recorded batch. A transaction receipt handles a
  // previous request that committed before the connection dropped.
  useEffect(() => {
    if (!user) return
    window.addEventListener('online', retry)
    const sub = Capacitor.isNativePlatform()
      ? CapApp.addListener('appStateChange', ({ isActive }) => isActive && retry())
      : null
    return () => {
      window.removeEventListener('online', retry)
      sub?.then((subscription) => subscription.remove())
    }
  }, [user])

  useEffect(() => {
    if (!user || !RETRYABLE.has(error?.code) || !navigator.onLine) return
    const timer = setTimeout(retry, 5000)
    return () => clearTimeout(timer)
  }, [user, error])

  const useCloudCopy = () => {
    updateWorkspace((current) => ({
      ...current,
      sync: { ...current.sync, base: null, legacyDirty: false },
    })).then(retry, showError)
  }

  return {
    user, authLoading, syncStatus: status, syncError: error ? failure(error) : '',
    hasUnsyncedChanges: unsynced, ownerEmail: workspace?.sync.email,
    retry, needsLegacyResolution: error?.code === 'legacy-dirty', useCloudCopy,
  }
}
