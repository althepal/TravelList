import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { comingHomeSnapshot, defaultData } from './model'
import { parseData } from './parseData'

// On the phone, data lives in the app's Documents folder: it's included in
// iCloud device backups and visible in the Files app (On My iPhone ›
// TravelList). In a desktop browser (development) it falls back to localStorage.
const DATA_FILE = 'travellist.json'
const SYNC_STATE_FILE = 'travellist-sync.json'
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

// Writes run one at a time in the order they're called, so the list is always
// on disk before anything written after it (like the sync state's unsynced
// marker), and the newest list is always written last.
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

export async function loadData() {
  const text = await readText(DATA_FILE)
  return text ? parseData(JSON.parse(text)) : defaultData()
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

// One queued step, so each list and its Shortcuts snapshot are written together.
export function saveData(data) {
  return enqueue(async () => {
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2))
    await writeFile(COMING_HOME_FILE, JSON.stringify(comingHomeSnapshot(data)))
  })
}

// Which account this device syncs with, and whether it has changes the cloud
// hasn't seen yet.
export async function loadSyncState() {
  const empty = { uid: null, email: null, dirty: false }
  const text = await readText(SYNC_STATE_FILE)
  if (!text) return empty
  try {
    const { uid, email, dirty } = JSON.parse(text)
    return { uid: uid ?? null, email: email ?? null, dirty: Boolean(dirty) }
  } catch {
    return empty
  }
}

// Known, accepted risk: if a list write fails (e.g. the phone is out of
// space) the unsynced marker written after it still lands, so the next
// sign-in could upload the older on-disk list. Rare, and the app already
// shows a save error when it happens.
export function saveSyncState({ uid, email, dirty }) {
  return enqueue(() => writeFile(SYNC_STATE_FILE, JSON.stringify({ uid, email, dirty })))
}
