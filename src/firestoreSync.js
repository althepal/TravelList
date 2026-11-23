import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { parseData } from './parseData'
import { planCloudWrite } from './syncState'

export function createFirestoreSync(db) {
  const userDataDoc = (user) => doc(db, 'users', user.uid, 'state', 'travelList')

  // First sign-in seeds a new account from this device.
  const ensureCloudData = (user, localData) => {
    const ref = userDataDoc(user)
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (snapshot.exists()) {
        const { payload, restoreId = null } = snapshot.data()
        return { data: parseData(payload), restoreId }
      }
      const data = JSON.parse(JSON.stringify(localData))
      transaction.set(ref, { payload: data, syncRevision: 1, updatedAt: serverTimestamp() })
      return { data, restoreId: null }
    })
  }

  const listenForCloudData = (user, callback, onError) =>
    onSnapshot(userDataDoc(user), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.exists() && !snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache) {
        const { payload, restoreId = null } = snapshot.data()
        callback({ data: payload, restoreId })
      }
    }, onError)

  const saveCloudData = (user, sync) => {
    const ref = userDataDoc(user)
    const receipt = doc(db, 'users', user.uid, 'state', `syncBatch-${sync.pending.id}`)
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists()) throw new Error('The cloud list is missing. Try syncing again.')
      const committed = await transaction.get(receipt)
      const document = snapshot.data()
      const { data, fields } = planCloudWrite(document, sync, committed.exists())
      if (fields) {
        transaction.update(ref, { ...JSON.parse(JSON.stringify(fields)), updatedAt: serverTimestamp() })
        transaction.set(receipt, { committedAt: serverTimestamp() })
      }
      return { data, restoreId: fields?.restoreId ?? document.restoreId ?? null }
    })
  }

  return { ensureCloudData, listenForCloudData, saveCloudData }
}
