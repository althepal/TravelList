import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { comingHomeSnapshot, defaultData, refreshStarterList } from './model'

// On the phone, data lives in the app's Documents folder: it's included in
// iCloud device backups and visible in the Files app (On My iPhone ›
// TravelList). In a desktop browser (development) it falls back to localStorage.
const DATA_FILE = 'travellist.json'
const SYNC_STATE_FILE = 'travellist-sync.json'
const ACCOUNT_DATA_PREFIX = 'travellist-account-'
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

async function writeText(path, text) {
  if (!native) return localStorage.setItem(path, text)
  await Filesystem.writeFile({ path, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 })
}

export async function loadData() {
  const text = await readText(DATA_FILE)
  return text ? refreshStarterList(JSON.parse(text)) : defaultData()
}

export async function saveData(data) {
  await writeText(DATA_FILE, JSON.stringify(data, null, 2))
  await writeText(COMING_HOME_FILE, JSON.stringify(comingHomeSnapshot(data)))
}

export async function loadSyncState() {
  const text = await readText(SYNC_STATE_FILE)
  if (!text) return { dirty: false, uid: null }
  try {
    const state = JSON.parse(text)
    return { dirty: Boolean(state.dirty), uid: state.uid ?? null }
  } catch {
    return { dirty: false, uid: null }
  }
}

export async function saveSyncState(state) {
  await writeText(SYNC_STATE_FILE, JSON.stringify({ dirty: Boolean(state.dirty), uid: state.uid ?? null }))
}

export async function loadAccountData(uid) {
  if (!uid) return null
  const text = await readText(`${ACCOUNT_DATA_PREFIX}${encodeURIComponent(uid)}.json`)
  if (!text) return null
  try {
    const saved = JSON.parse(text)
    return { data: refreshStarterList(saved.data), dirty: Boolean(saved.dirty) }
  } catch {
    return null
  }
}

export async function saveAccountData(uid, data, dirty) {
  if (!uid) return
  await writeText(`${ACCOUNT_DATA_PREFIX}${encodeURIComponent(uid)}.json`, JSON.stringify({ data, dirty: Boolean(dirty) }))
}
