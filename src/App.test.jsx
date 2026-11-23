// @vitest-environment jsdom
import { act } from 'react'
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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
  for (const { node, root } of roots.splice(0)) {
    await act(async () => { root.unmount() })
    node.remove()
  }
  delete navigator.locks
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

  await act(async () => { first.root.unmount() })
  roots.shift()
  first.node.remove()
  expect(loadWorkspace).toHaveBeenCalledTimes(2)
  expect(second.node.textContent).toContain('Recovered trip')
})
