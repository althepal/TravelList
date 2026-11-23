import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getFirestore, setDoc } from 'firebase/firestore'
import { createServer } from 'vite'

const projectId = 'demo-travellist-sync'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST
assert.match(authHost ?? '', /^127\.0\.0\.1:\d+$/, 'Run with the local Auth emulator')
assert.match(firestoreHost ?? '', /^127\.0\.0\.1:\d+$/, 'Run with the local Firestore emulator')
const [host, port] = firestoreHost.split(':')
const apps = []
const vite = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: false,
  envDir: false,
  server: { middlewareMode: true, hmr: false, watch: null },
})

const { createFirestoreSync } = await vite.ssrLoadModule('/src/firestoreSync.js')
const { defaultData, newTrip, saveTrip, addExtra, deleteTrip, deleteTemplate, removeExtra, toggleChecked } =
  await vite.ssrLoadModule('/src/model.js')
const { newWorkspace, prepareBatch, acceptCloud } = await vite.ssrLoadModule('/src/syncState.js')

const password = 'emulator-only'
const email = (account) => `${account}@example.test`
async function client(name, account = name) {
  const app = initializeApp({ projectId, apiKey: 'demo-api-key' }, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, host, Number(port))
  const session = account === null ? null : account === name
    ? await createUserWithEmailAndPassword(auth, email(account), password)
    : await signInWithEmailAndPassword(auth, email(account), password)
  return { auth, db, user: session?.user, ...createFirestoreSync(db) }
}

function batch(user, baseline, data, { restoreId = null, replacement = null } = {}) {
  const workspace = newWorkspace(baseline, user)
  return prepareBatch({ data, sync: { ...workspace.sync, restoreId, replacement } })
}

const denied = { code: 'permission-denied' }
try {
  const owner = await client('owner')
  const peer = await client('peer', 'owner')
  const other = await client('other')
  const guest = await client('guest', null)
  const path = ['users', owner.user.uid, 'state', 'travelList']
  const list = doc(owner.db, ...path)
  const otherList = doc(other.db, ...path)
  const guestList = doc(guest.db, ...path)

  const retired = { ...newTrip('2026-11-23'), name: 'Retired trip' }
  const active = { ...newTrip('2026-11-23'), name: 'Shared trip' }
  const original = addExtra(saveTrip(saveTrip(defaultData(), retired), active), active.id, 'pack', 'Spare cable')
  const extra = original.trips[1].extras[0]
  const [template, second] = original.templates
  const firstKey = `t:${template.id}`
  const secondKey = `t:${second.id}`
  const legacy = { payload: original }

  await assert.rejects(setDoc(list, { ...legacy, syncRevision: 1.5 }), denied)
  await setDoc(list, legacy)
  await assert.rejects(setDoc(list, { ...legacy, syncRevision: 1.5 }), denied)
  await setDoc(list, legacy)
  await assert.rejects(getDocFromServer(otherList), denied)
  await assert.rejects(setDoc(otherList, legacy), denied)
  await assert.rejects(deleteDoc(otherList), denied)
  await assert.rejects(getDocFromServer(guestList), denied)
  await assert.rejects(setDoc(guestList, legacy), denied)

  const first = batch(owner.user, original, toggleChecked(original, active.id, firstKey))
  const remote = batch(peer.user, original, toggleChecked(original, active.id, secondKey))
  await owner.saveCloudData(owner.user, first.sync)
  await peer.saveCloudData(peer.user, remote.sync)
  const both = (await owner.ensureCloudData(owner.user, defaultData())).data
  assert.deepEqual(both.trips[1].checked, { [firstKey]: true, [secondKey]: true })
  assert.equal((await getDocFromServer(list)).data().syncRevision, 2)
  await assert.rejects(setDoc(list, legacy), denied)
  await assert.rejects(setDoc(list, { ...legacy, syncRevision: 2.5 }), denied)
  await assert.rejects(setDoc(list, { ...legacy, syncRevision: 4 }), denied)

  const cleared = toggleChecked(both, active.id, firstKey)
  const newer = prepareBatch({ data: cleared, sync: { ...first.sync, base: both, pending: null } })
  await owner.saveCloudData(owner.user, newer.sync)
  const replay = await owner.saveCloudData(owner.user, first.sync)
  assert.deepEqual(replay.data.trips[1].checked, { [secondKey]: true })
  assert.equal((await getDocFromServer(list)).data().syncRevision, 3)
  const receiptPath = ['users', owner.user.uid, 'state', `syncBatch-${first.sync.pending.id}`]
  assert.equal((await getDocFromServer(doc(owner.db, ...receiptPath))).exists(), true)
  await assert.rejects(getDocFromServer(doc(other.db, ...receiptPath)), denied)
  console.log('Passed the app transaction, receipt replay, revision rules and owner isolation checks.')

  const removed = deleteTrip(deleteTemplate(removeExtra(cleared, active.id, extra.id), template.id), retired.id)
  const queuedChecks = toggleChecked(toggleChecked(toggleChecked(cleared, retired.id, secondKey), active.id, firstKey), active.id, `x:${extra.id}`)
  await owner.saveCloudData(owner.user, batch(owner.user, cleared, removed).sync)
  const afterDelete = (await peer.saveCloudData(peer.user, batch(peer.user, cleared, queuedChecks).sync)).data
  assert.deepEqual(afterDelete.trips.map(({ id }) => id), [active.id])
  assert.deepEqual(afterDelete.trips[0].extras, [])
  assert.deepEqual(afterDelete.trips[0].checked, { [secondKey]: true })
  console.log('Passed two-client deletion races for a trip, master item, and one-off.')

  const restored = saveTrip(defaultData(), active)
  const offlineEdit = batch(peer.user, afterDelete, addExtra(afterDelete, active.id, 'pack', 'Queued before restore'))
  const restore = batch(owner.user, afterDelete, restored, { replacement: 'test-restore' })
  await owner.saveCloudData(owner.user, restore.sync)
  const afterRestore = await peer.saveCloudData(peer.user, offlineEdit.sync)
  assert.equal(afterRestore.restoreId, 'test-restore')
  assert.deepEqual(afterRestore.data, restored)
  assert.deepEqual((await owner.ensureCloudData(owner.user, defaultData())).data, restored)
  console.log('Passed two-client backup restore racing an older offline edit.')

  await signOut(peer.auth)
  const switched = (await signInWithEmailAndPassword(peer.auth, email('other'), password)).user
  const accountCloud = await peer.ensureCloudData(switched, defaultData())
  const switchedWorkspace = acceptCloud(offlineEdit, accountCloud.data, switched, offlineEdit.data, accountCloud.restoreId)
  assert.equal(switchedWorkspace.sync.uid, other.user.uid)
  assert.equal(switchedWorkspace.sync.pending, null)
  assert.deepEqual(switchedWorkspace.data, defaultData())
  assert.deepEqual((await owner.ensureCloudData(owner.user, defaultData())).data, restored)
  console.log('Passed sign-in to another account without transferring the previous account list.')
} finally {
  await Promise.all(apps.map(deleteApp))
  await vite.close()
}
