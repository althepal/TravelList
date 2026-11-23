// @vitest-environment jsdom
import { act, useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }))
vi.mock('./storage', () => ({ saveWorkspace: vi.fn() }))
vi.mock('./firebase', () => ({
  firebaseConfigured: true,
  observeAuth: vi.fn(),
  ensureCloudData: vi.fn(),
  listenForCloudData: vi.fn(),
  saveCloudData: vi.fn(),
}))

import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { ensureCloudData, listenForCloudData, observeAuth, saveCloudData } from './firebase'
import { defaultData, newTrip, saveTrip, toggleChecked } from './model'
import { saveWorkspace } from './storage'
import { newWorkspace, prepareBatch } from './syncState'
import { useCloudSync } from './useCloudSync'

const user = { uid: 'owner', email: 'owner@example.test' }
const trip = newTrip('2026-11-23')
const baseline = saveTrip(defaultData(), trip)
const [key, remoteKey] = baseline.templates.map((item) => `t:${item.id}`)
const edited = toggleChecked(baseline, trip.id, key)
const cloud = (data) => ({ data, restoreId: null })
const offline = Object.assign(new Error('Unavailable'), { code: 'unavailable' })

let root
let view
let authChanged
let appStateChanged
let stopListening

function Harness({ initial }) {
  const [workspace, setWorkspace] = useState(initial)
  const current = useRef(initial)
  const updateWorkspace = useCallback((update) => {
    current.current = update(current.current)
    setWorkspace(current.current)
    return Promise.resolve()
  }, [])
  const sync = useCloudSync(workspace, current, updateWorkspace)
  view = { workspace, updateWorkspace, sync }
  return null
}

async function open(initial = newWorkspace(baseline, user)) {
  root = createRoot(document.createElement('div'))
  await act(async () => { root.render(<Harness initial={initial} />) })
  await act(async () => { authChanged(user) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Capacitor.isNativePlatform.mockReturnValue(true)
  observeAuth.mockImplementation((callback) => { authChanged = callback; return vi.fn() })
  CapApp.addListener.mockImplementation((_name, callback) => {
    appStateChanged = callback
    return Promise.resolve({ remove: vi.fn() })
  })
  ensureCloudData.mockResolvedValue(cloud(baseline))
  stopListening = vi.fn()
  listenForCloudData.mockReturnValue(stopListening)
  saveWorkspace.mockResolvedValue()
  saveCloudData.mockResolvedValue(cloud(edited))
})

afterEach(async () => {
  await act(async () => { root?.unmount() })
  root = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCloudSync', () => {
  it('debounces edits, persists each batch before upload, and pauses and resumes the listener', async () => {
    const persisted = Promise.withResolvers()
    const uploaded = Promise.withResolvers()
    saveWorkspace.mockReturnValueOnce(persisted.promise)
    saveCloudData.mockReturnValueOnce(uploaded.promise)
    await open()
    const oldListener = listenForCloudData.mock.calls[0][1]
    await act(async () => { await view.updateWorkspace((current) => ({ ...current, data: edited })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(349) })
    expect(saveWorkspace).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(stopListening).toHaveBeenCalledOnce()
    expect(view.workspace.sync.pending.data).toEqual(edited)
    expect(saveCloudData).not.toHaveBeenCalled()

    const remote = toggleChecked(baseline, trip.id, remoteKey)
    await act(async () => { oldListener(cloud(remote)); persisted.resolve() })
    expect(view.workspace.data).toEqual(edited)
    expect(saveCloudData).toHaveBeenCalledWith(user, view.workspace.sync)
    await act(async () => { uploaded.resolve(cloud(toggleChecked(edited, trip.id, remoteKey))) })
    expect(view.workspace.sync.pending).toBeNull()
    expect(view.workspace.data.trips[0].checked).toEqual({ [key]: true, [remoteKey]: true })
    expect(listenForCloudData).toHaveBeenCalledTimes(2)
  })

  it('retries a persisted batch after offline relaunch only when iOS returns to the foreground', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    ensureCloudData.mockRejectedValueOnce(offline)
    const draft = prepareBatch({ ...newWorkspace(baseline, user), data: edited })
    await open(draft)
    expect(view.sync.hasUnsyncedChanges).toBe(true)
    expect(view.sync.syncStatus).toBe('Saved on this device')
    expect(saveCloudData).not.toHaveBeenCalled()

    await act(async () => { appStateChanged({ isActive: false }); await vi.advanceTimersByTimeAsync(10_000) })
    expect(ensureCloudData).toHaveBeenCalledOnce()
    await act(async () => { appStateChanged({ isActive: true }) })
    expect(ensureCloudData).toHaveBeenCalledTimes(2)
    expect(saveCloudData).toHaveBeenCalledWith(user, draft.sync)
    expect(view.workspace.sync.pending).toBeNull()
    expect(view.sync.hasUnsyncedChanges).toBe(false)
  })

  it('retries transient failures even when the browser reports it is online', async () => {
    Capacitor.isNativePlatform.mockReturnValue(false)
    ensureCloudData.mockRejectedValueOnce(offline)
    await open()
    expect(view.sync.syncStatus).toBe('Saved on this device')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(ensureCloudData).toHaveBeenCalledTimes(2)
    expect(view.sync.syncStatus).toBe('Up to date')
    expect(CapApp.addListener).not.toHaveBeenCalled()
  })
})
