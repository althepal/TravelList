// @vitest-environment jsdom
import { act } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('./storage', () => ({ loadWorkspace: vi.fn(), saveWorkspace: vi.fn(), keepUnreadableData: vi.fn() }))
vi.mock('./firebase', () => ({
  firebaseConfigured: true,
  observeAuth: vi.fn(),
  ensureCloudData: vi.fn(),
  listenForCloudData: vi.fn(),
  saveCloudData: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutAccount: vi.fn(),
}))
vi.mock('./reminders', () => ({ syncReminders: vi.fn().mockResolvedValue() }))
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { addListener: vi.fn() } }))

import App from './App'
import { ensureCloudData, observeAuth, listenForCloudData, saveCloudData } from './firebase'
import { defaultData, newTrip, saveTrip } from './model'
import { keepUnreadableData, loadWorkspace, saveWorkspace } from './storage'
import { newWorkspace } from './syncState'

const user = { uid: 'owner', email: 'owner@example.test' }
const recovered = saveTrip(defaultData(), { ...newTrip('2026-11-23'), name: 'Recovered trip' })
const oldCloud = saveTrip(defaultData(), { ...newTrip('2026-11-23'), name: 'Old cloud trip' })
const roots = []
let authChanged

async function open() {
  const node = document.body.appendChild(document.createElement('div'))
  const root = createRoot(node)
  roots.push({ node, root })
  await act(async () => { root.render(<App />) })
  return { node, root }
}

async function close({ node, root }) {
  await act(async () => { root.unmount() })
  node.remove()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  observeAuth.mockImplementation((callback) => { authChanged = callback; return vi.fn() })
  loadWorkspace.mockResolvedValue(newWorkspace(recovered))
  saveWorkspace.mockResolvedValue()
  keepUnreadableData.mockResolvedValue()
  ensureCloudData.mockResolvedValue({ data: oldCloud, restoreId: null })
  listenForCloudData.mockReturnValue(vi.fn())
  saveCloudData.mockImplementation((_user, sync) => Promise.resolve({
    data: sync.pending.data,
    restoreId: sync.pending.replacement,
  }))
})

afterEach(async () => {
  for (const app of roots.splice(0)) await close(app)
  delete navigator.locks
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('reopens the last trip and remembers when the user returns to Trips', async () => {
  const initial = await open()
  await act(async () => { initial.node.querySelector('.trip-card').click() })
  expect(initial.node.querySelector('h1').textContent).toBe('Recovered trip')
  await close(roots.pop())

  const reopened = await open()
  expect(reopened.node.querySelector('h1').textContent).toBe('Recovered trip')
  await act(async () => { reopened.node.querySelector('.back').click() })
  await close(roots.pop())

  const home = await open()
  expect(home.node.querySelector('h1').textContent).toBe('TravelList')
})

it('reopens Trips after leaving the New trip form', async () => {
  const { node } = await open()
  await act(async () => { node.querySelector('.hero button').click() })
  expect(node.querySelector('h1').textContent).toBe('New trip')
  await close(roots.pop())

  const reopened = await open()
  expect(reopened.node.querySelector('h1').textContent).toBe('TravelList')
})

it('reopens the trip checklist after leaving the Edit trip form', async () => {
  const tripId = recovered.trips[0].id
  localStorage.setItem('travellist-screen', JSON.stringify({ name: 'tripForm', id: tripId }))
  const { node } = await open()
  expect(node.querySelector('h1').textContent).toBe('Recovered trip')
  await act(async () => { node.querySelector('.topbar-side.right button').click() })
  expect(node.querySelector('h1').textContent).toBe('Edit trip')
  await close(roots.pop())
  expect(JSON.parse(localStorage.getItem('travellist-screen'))).toEqual({ name: 'trip', id: tripId })

  const reopened = await open()
  expect(reopened.node.querySelector('h1').textContent).toBe('Recovered trip')
})

it.each(['Save', 'Cancel'])('keeps the edit form open after a synced deletion and lets the user choose %s', async (action) => {
  loadWorkspace.mockResolvedValue(newWorkspace(recovered, user))
  ensureCloudData.mockResolvedValue({ data: recovered, restoreId: null })
  const { node } = await open()
  await act(async () => { authChanged(user) })
  const receiveCloudUpdate = listenForCloudData.mock.lastCall[1]
  await act(async () => { node.querySelector('.trip-card').click() })
  await act(async () => { node.querySelector('.topbar-side.right button').click() })
  const name = node.querySelector('form input')
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setValue.call(name, 'Unsaved trip name')
    name.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await act(async () => { receiveCloudUpdate({ data: defaultData(), restoreId: null }) })
  expect(saveWorkspace.mock.lastCall[0].data.trips).toEqual([])
  expect(node.querySelector('h1').textContent).toBe('Edit trip')
  expect(node.querySelector('form input')).toBe(name)
  expect(name.value).toBe('Unsaved trip name')
  const save = node.querySelector('button[type=submit]')
  expect(save.textContent).toBe('Save')
  if (action === 'Cancel') {
    await act(async () => { node.querySelector('.back').click() })
    expect(node.querySelector('h1').textContent).toBe('TravelList')
    expect(saveWorkspace.mock.lastCall[0].data.trips).toEqual([])
    return
  }

  await act(async () => { save.click() })
  expect(node.querySelector('h1').textContent).toBe('Unsaved trip name')
  const restored = { id: recovered.trips[0].id, name: 'Unsaved trip name' }
  expect(saveWorkspace.mock.lastCall[0].data.trips).toEqual([expect.objectContaining(restored)])
  await act(async () => { await vi.advanceTimersByTimeAsync(350) })
  expect(saveCloudData).toHaveBeenCalledWith(user, expect.objectContaining({
    base: expect.objectContaining({ trips: [] }),
    pending: expect.objectContaining({
      data: expect.objectContaining({ trips: [expect.objectContaining(restored)] }),
    }),
  }))
})

it.each(['trip', 'tripForm'])('opens Trips when the saved %s refers to a deleted trip', async (name) => {
  localStorage.setItem('travellist-screen', JSON.stringify({ name, id: oldCloud.trips[0].id }))
  const { node } = await open()
  expect(node.querySelector('h1').textContent).toBe('TravelList')
  expect(JSON.parse(localStorage.getItem('travellist-screen'))).toEqual({ name: 'trips' })
})

it('opens Trips when the saved page cannot be read', async () => {
  localStorage.setItem('travellist-screen', '{invalid JSON')
  const { node } = await open()
  expect(node.querySelector('h1').textContent).toBe('TravelList')
})

it('opens a reminder’s trip instead of the saved page when launched from a notification', async () => {
  localStorage.setItem('travellist-screen', JSON.stringify({ name: 'master' }))
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
  LocalNotifications.addListener.mockImplementation(async (_event, notify) => {
    notify({ notification: { extra: { tripId: recovered.trips[0].id } } })
    return { remove: vi.fn() }
  })
  const { node } = await open()
  expect(node.querySelector('h1').textContent).toBe('Recovered trip')
})

it.each([true, false])('restores a backup after a load failure with an existing sign-in of %s', async (signedIn) => {
  loadWorkspace.mockRejectedValueOnce(new Error('Invalid saved file'))
  const { node } = await open()
  await act(async () => { authChanged(signedIn ? user : null) })
  expect(node.textContent).toContain("Couldn't load your lists")
  const file = node.querySelector('input[type=file]')
  Object.defineProperty(file, 'files', { value: [{ text: async () => JSON.stringify(recovered) }] })
  await act(async () => { file.dispatchEvent(new Event('change', { bubbles: true })) })

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(signedIn ? user.email : 'the next account you sign in to'))
  expect(keepUnreadableData.mock.invocationCallOrder[0]).toBeLessThan(saveWorkspace.mock.invocationCallOrder[0])
  expect(node.textContent).toContain('Recovered trip')
  if (!signedIn) await act(async () => { authChanged(user) })
  await act(async () => { await vi.advanceTimersByTimeAsync(350) })
  expect(saveCloudData).toHaveBeenCalledWith(user, expect.objectContaining({
    pending: expect.objectContaining({ data: recovered, replacement: expect.any(String) }),
  }))
  expect(node.textContent).not.toContain('Old cloud trip')
})

it('waits to load a shared browser draft until the first tab releases it', async () => {
  let queue = Promise.resolve()
  const request = vi.fn((_name, _options, enter) => {
    queue = queue.then(enter)
    return queue
  })
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  const first = await open()
  const second = await open()
  expect(request).toHaveBeenCalledTimes(2)
  expect(loadWorkspace).toHaveBeenCalledOnce()
  expect(first.node.textContent).toContain('Recovered trip')
  expect(second.node.textContent).toContain('TravelList is open in another tab')

  await act(async () => { first.node.querySelector('.trip-card').click() })
  await close(roots.shift())
  expect(loadWorkspace).toHaveBeenCalledTimes(2)
  expect(second.node.querySelector('h1').textContent).toBe('Recovered trip')
})
