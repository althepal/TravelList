import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { comingHomeSnapshot, defaultData, refreshStarterList } from './model'

// On the phone, data lives in the app's Documents folder: it's included in
// iCloud device backups and visible in the Files app (On My iPhone ›
// TravelList). In a desktop browser (development) it falls back to localStorage.
const DATA_FILE = 'travellist.json'
// Read by the native Shortcuts action (ios/App/App/ComingHomeIntent.swift).
const COMING_HOME_FILE = 'coming-home.json'

const native = Capacitor.isNativePlatform()

async function readText(path) {
  if (!native) return localStorage.getItem(path)
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Documents, encoding: Encoding.UTF8 })
    return data
  } catch {
    return null // first launch: no file yet
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
