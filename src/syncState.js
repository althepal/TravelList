import { equalValues, mergeData } from './mergeData'
import { newId } from './model'
import { parseData } from './parseData'

export function newWorkspace(data, { uid = null, email = null, dirty = false } = {}) {
  return {
    data,
    sync: {
      clientId: newId(), uid, email,
      base: uid && !dirty ? data : null,
      legacyDirty: Boolean(uid && dirty),
      restoreId: null,
      replacement: null,
      pending: null,
    },
  }
}

export function recoverWorkspace(data, user) {
  const workspace = newWorkspace(data, user ?? {})
  return { data, sync: { ...workspace.sync, replacement: newId() } }
}

export function hasUnsyncedChanges({ data, sync }) {
  return Boolean(sync.uid && (sync.pending || sync.legacyDirty || sync.replacement ||
    (sync.base && !equalValues(sync.base, data))))
}

function withCloud(workspace, data, sync) {
  return { data: equalValues(workspace.data, data) ? workspace.data : data, sync }
}

export function acceptCloud(workspace, cloud, user, startingData = workspace.data, restoreId = null) {
  const { data, sync } = workspace
  const switching = Boolean(sync.uid && sync.uid !== user.uid)
  if (!switching && sync.pending) return workspace

  if (!switching && sync.legacyDirty && !sync.replacement && !equalValues(startingData, cloud)) {
    const error = new Error('This device has unsynced edits from before the update. Export a backup to keep them before choosing which copy to use.')
    error.code = 'legacy-dirty'
    throw error
  }
  const sameRestore = (sync.restoreId ?? null) === restoreId
  if (sync.uid === user.uid && sameRestore && equalValues(sync.base, cloud) && !sync.legacyDirty) return workspace

  const replacement = switching ? null : sync.replacement
  const nextData = replacement ? data : switching || (sync.uid && !sameRestore)
    ? cloud : mergeData(sync.base ?? startingData, data, cloud)
  return withCloud(workspace, nextData, {
    ...sync, uid: user.uid, email: user.email ?? null, base: cloud, restoreId,
    pending: null, legacyDirty: false, replacement,
  })
}

export function prepareBatch(workspace) {
  const { data, sync } = workspace
  if (!sync.base || sync.pending || !hasUnsyncedChanges(workspace)) return workspace
  return {
    data,
    sync: { ...sync, pending: { id: newId(), data, replacement: sync.replacement } },
  }
}

export function acknowledgeBatch(workspace, batch, cloud, restoreId = null) {
  const { data, sync } = workspace
  if (sync.pending?.id !== batch.id) return workspace
  const replacement = sync.replacement === batch.replacement ? null : sync.replacement
  // Edits made during a request are still local changes against what it sent.
  const superseded = (batch.replacement ?? sync.restoreId ?? null) !== restoreId
  const nextData = replacement ? data : superseded ? cloud : mergeData(batch.data, data, cloud)
  return withCloud(workspace, nextData, { ...sync, base: cloud, restoreId, pending: null, replacement })
}

export function planCloudWrite(document, { base, clientId, pending, restoreId }, committed = false) {
  const cloud = parseData(document.payload)
  // Keep recognizing batches committed by builds that stored receipts inline.
  if (committed || document.syncReceipts?.[clientId] === pending.id) return { data: cloud }
  if (!pending.replacement && (restoreId ?? null) !== (document.restoreId ?? null)) return { data: cloud }

  const data = pending.replacement ? pending.data : mergeData(base, pending.data, cloud)
  return {
    data,
    fields: {
      payload: data,
      syncRevision: (document.syncRevision ?? 0) + 1,
      ...(pending.replacement ? { restoreId: pending.replacement } : {}),
    },
  }
}
