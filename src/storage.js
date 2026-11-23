import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { comingHomeSnapshot, defaultData } from './model'
import { DataError, parseData } from './parseData'
import { newWorkspace } from './syncState'

// On the phone, data lives in the app's Documents folder: it's included in
// iCloud device backups and visible in the Files app (On My iPhone ›
// TravelList). In a desktop browser (development) it falls back to localStorage.
const DATA_FILE = 'travellist.json'
const LEGACY_SYNC_STATE_FILE = 'travellist-sync.json'
// Read by the native Shortcuts action (ios/App/App/ComingHomeIntent.swift).
const COMING_HOME_FILE = 'coming-home.json'

const native = Capacitor.isNativePlatform()

async function readText(path) {
  if (!native) return localStorage.getItem(path)
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Documents, encoding: Encoding.UTF8 })
    return data
  } catch (error) {
    // Capacitor uses this code only when the requested file is absent. Other
    // read failures must reach App so it won't replace unreadable saved data.
    if (error?.code === 'OS-PLUG-FILE-0008') return null
    throw error
  }
}

// Writes run in call order so the newest list is always written last.
let writes = Promise.resolve()

function enqueue(task) {
  const run = writes.then(task)
  writes = run.catch(() => {}) // a failed write doesn't block later ones
  return run
}

function writeFile(path, text) {
  if (!native) return localStorage.setItem(path, text)
  return Filesystem.writeFile({ path, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 })
}

export async function loadWorkspace() {
  const text = await readText(DATA_FILE)
  const raw = text ? JSON.parse(text) : null
  const data = text ? parseData(raw) : defaultData()
  if (!raw || !Object.hasOwn(raw, '_sync')) return newWorkspace(data, await loadLegacySync())

  const sync = raw._sync
  if (!sync || typeof sync.clientId !== 'string' || (sync.pending && (!sync.uid || !sync.base || typeof sync.pending.id !== 'string'))) {
    throw new DataError('The saved sync settings are damaged.')
  }
  return {
    data,
    sync: {
      ...sync,
      base: sync.base ? parseData(sync.base) : null,
      pending: sync.pending ? { ...sync.pending, data: parseData(sync.pending.data) } : null,
    },
  }
}

// Before a list the app couldn't read is replaced, keep it beside the main file
// (visible in the Files app) so nothing is lost. Throws if the copy fails, so
// the caller can leave the original alone.
export function keepUnreadableData(now = new Date()) {
  return enqueue(async () => {
    const text = await readText(DATA_FILE)
    if (!text) return
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    await writeFile(`travellist-unreadable-${stamp}.json`, text)
  })
}

// Saving the draft and sync checkpoint in one file keeps a restart from pairing
// one list with another list's checkpoint. Backups still export data alone.
export function saveWorkspace({ data, sync }, updateReminders = true) {
  return enqueue(async () => {
    await writeFile(DATA_FILE, JSON.stringify({ ...data, _sync: sync }))
    if (updateReminders) await writeFile(COMING_HOME_FILE, JSON.stringify(comingHomeSnapshot(data)))
  })
}

async function loadLegacySync() {
  const text = await readText(LEGACY_SYNC_STATE_FILE)
  if (!text) return {}
  try {
    const { uid, email, dirty } = JSON.parse(text)
    return { uid: uid ?? null, email: email ?? null, dirty: Boolean(dirty) }
  } catch {
    return {}
  }
}
