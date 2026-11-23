import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
}))

import { Filesystem } from '@capacitor/filesystem'
import { defaultData, newTrip, saveTrip } from './model'
import { keepUnreadableData, loadWorkspace, saveWorkspace } from './storage'
import { newWorkspace, prepareBatch } from './syncState'

describe('loadWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses starter data only when the saved file is missing', async () => {
    Filesystem.readFile.mockRejectedValue({ code: 'OS-PLUG-FILE-0008', message: 'file does not exist' })
    expect((await loadWorkspace()).data).toEqual(defaultData())
  })

  it('surfaces other read errors instead of treating them as first launch', async () => {
    const error = { code: 'OS-PLUG-FILE-0007', message: 'permission denied' }
    Filesystem.readFile.mockRejectedValue(error)
    await expect(loadWorkspace()).rejects.toBe(error)
    expect(Filesystem.writeFile).not.toHaveBeenCalled()
  })

  it.each([false, true])('opens a legacy workspace with dirty=%s', async (dirty) => {
    const data = defaultData()
    Filesystem.readFile.mockImplementation(async ({ path }) => ({
      data: JSON.stringify(path === 'travellist.json' ? data : { uid: 'owner', email: 'test@example.test', dirty }),
    }))
    const workspace = await loadWorkspace()
    expect(workspace.data).toEqual(data)
    expect(workspace.sync).toMatchObject({ uid: 'owner', base: dirty ? null : data, legacyDirty: dirty })
  })
})

describe('keepUnreadableData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copies the saved list aside, finishing before a later save replaces it', async () => {
    Filesystem.readFile.mockResolvedValue({ data: '{"broken": true}' })
    const order = []
    Filesystem.writeFile.mockImplementation(async ({ path, data }) => order.push([path, data]))
    const kept = keepUnreadableData(new Date('2026-11-23T15:04:05.678Z'))
    const saved = saveWorkspace(newWorkspace(defaultData()))
    await kept
    await saved
    expect(order[0]).toEqual(['travellist-unreadable-20261123T150405Z.json', '{"broken": true}'])
    expect(order[1][0]).toBe('travellist.json')
  })
})

describe('writes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists draft, baseline and pending batch together and keeps save order', async () => {
    const order = []
    const files = new Map()
    Filesystem.writeFile.mockImplementation(async ({ path, data }) => {
      if (!files.has(path)) await new Promise((resolve) => setTimeout(resolve, 20))
      files.set(path, data)
      order.push([path, data])
    })
    Filesystem.readFile.mockImplementation(async ({ path }) => ({ data: files.get(path) }))
    const base = newWorkspace(defaultData(), { uid: 'u1' })
    const trip = { ...newTrip('2026-11-23'), name: 'Saved while offline' }
    const pending = prepareBatch({ ...base, data: saveTrip(base.data, trip) })
    const first = saveWorkspace(base)
    await saveWorkspace(pending)
    await first
    expect(order.map(([path]) => path)).toEqual(['travellist.json', 'coming-home.json', 'travellist.json', 'coming-home.json'])
    expect(await loadWorkspace()).toEqual(pending)
  })
})
