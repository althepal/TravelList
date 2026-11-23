import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn() },
}))

import { Filesystem } from '@capacitor/filesystem'
import { defaultData } from './model'
import { loadData } from './storage'

describe('loadData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses starter data only when the saved file is missing', async () => {
    Filesystem.readFile.mockRejectedValue({ code: 'OS-PLUG-FILE-0008', message: 'file does not exist' })
    expect(await loadData()).toMatchObject(defaultData())
  })

  it('surfaces other read errors instead of treating them as first launch', async () => {
    const error = { code: 'OS-PLUG-FILE-0007', message: 'permission denied' }
    Filesystem.readFile.mockRejectedValue(error)
    await expect(loadData()).rejects.toBe(error)
    expect(Filesystem.writeFile).not.toHaveBeenCalled()
  })
})
