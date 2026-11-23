import { describe, expect, it } from 'vitest'
import { equalValues, mergeData } from './mergeData'
import { addExtra, defaultData, deleteQuestion, deleteTemplate, deleteTrip, newTrip, removeExtra, saveTrip, toggleChecked, updateTrip } from './model'
import { parseData } from './parseData'
import { acknowledgeBatch, acceptCloud, hasUnsyncedChanges, newWorkspace, planCloudWrite, prepareBatch } from './syncState'

const user = { uid: 'owner', email: 'test@example.test' }
const trip = newTrip('2026-11-23')
const base = saveTrip(defaultData(), trip)
const [pants, shirt] = base.templates.map((item) => `t:${item.id}`)
const firstEdit = toggleChecked(base, trip.id, pants)
const secondEdit = toggleChecked(base, trip.id, shirt)

function makeBatch(data, baseline = base) {
  const workspace = newWorkspace(baseline, user)
  return prepareBatch({ ...workspace, data })
}

describe('mergeData', () => {
  it('preserves two checkbox edits against the same cloud baseline in either commit order', () => {
    const expected = { [pants]: true, [shirt]: true }
    expect(mergeData(base, firstEdit, secondEdit).trips[0].checked).toEqual(expected)
    expect(mergeData(base, secondEdit, firstEdit).trips[0].checked).toEqual(expected)
  })

  it('applies an uncheck and retains unrelated additions', () => {
    const local = toggleChecked(firstEdit, trip.id, pants)
    const cloud = addExtra(firstEdit, trip.id, 'pack', 'Café / 水')
    expect(mergeData(firstEdit, local, cloud).trips[0]).toMatchObject({ checked: {}, extras: cloud.trips[0].extras })
  })

  it('keeps distinct fields of the same trip and gives the last commit the shared field', () => {
    const local = updateTrip(base, trip.id, (item) => ({ ...item, name: 'Local' }))
    const cloud = updateTrip(secondEdit, trip.id, (item) => ({ ...item, name: 'Cloud', headingHome: true }))
    expect(mergeData(base, local, cloud).trips[0]).toMatchObject({
      name: 'Local', headingHome: true, checked: { [shirt]: true },
    })
  })

  it('prevents stale checklist changes from restoring a deleted trip', () => {
    expect(mergeData(base, firstEdit, deleteTrip(base, trip.id)).trips).toEqual([])
    expect(mergeData(base, deleteTrip(base, trip.id), firstEdit).trips).toEqual([])
  })

  it('clears concurrent references to deleted questions, master items and one-offs', () => {
    const question = base.questions[0]
    const template = base.templates[0]
    const original = addExtra(base, trip.id, 'pack', 'To remove')
    const extra = original.trips[0].extras[0]
    const local = deleteQuestion(deleteTemplate(removeExtra(original, trip.id, extra.id), template.id), question.id)
    const cloud = updateTrip(toggleChecked(original, trip.id, pants), trip.id, (item) => ({
      ...item, checked: { ...item.checked, [`x:${extra.id}`]: true },
      answers: { [question.id]: true }, hidden: { [template.id]: true },
    }))
    expect(mergeData(original, local, cloud).trips[0]).toMatchObject({ checked: {}, answers: {}, hidden: {}, extras: [] })
  })

  it('keeps a valid pair of dates when both clients change a date', () => {
    const local = updateTrip(base, trip.id, (item) => ({ ...item, start: '2026-12-03' }))
    const cloud = updateTrip(base, trip.id, (item) => ({ ...item, end: '2026-12-01' }))
    expect(parseData(mergeData(base, local, cloud)).trips[0]).toMatchObject({ start: '2026-12-03', end: '2026-12-03' })
  })

  it('treats object key order as equivalent', () => {
    expect(equalValues({ first: 1, second: { x: true } }, { second: { x: true }, first: 1 })).toBe(true)
  })

  it('keeps saved rows with duplicate IDs through unrelated edits', () => {
    const first = { ...trip, name: 'First trip' }
    const second = { ...trip, name: 'Second trip', extras: [{ id: 'one-off', category: 'pack', text: 'Second trip item' }] }
    const original = parseData({ ...base, trips: [first, second] })
    const local = { ...original, templates: original.templates.map((item, index) => index === 0 ? { ...item, text: 'Local' } : item) }
    const cloud = { ...original, templates: original.templates.map((item, index) => index === 1 ? { ...item, text: 'Cloud' } : item) }
    const merged = mergeData(original, local, cloud)
    expect(merged.trips).toEqual(original.trips)
    expect(merged.templates.slice(0, 2).map(({ text }) => text)).toEqual(['Local', 'Cloud'])
  })

  it('keeps the cloud dependency when combining two valid edits would create a cycle', () => {
    const a = { id: 'a', text: 'A?', short: 'A', askIf: [] }
    const b = { id: 'b', text: 'B?', short: 'B', askIf: [] }
    const original = { ...base, questions: [a, b] }
    const local = { ...original, questions: [{ ...a, text: 'Edited A?', askIf: ['b'] }, b] }
    const cloud = { ...original, questions: [a, { ...b, askIf: ['a'] }] }
    const merged = mergeData(original, local, cloud)
    expect(parseData(merged, { imported: true }).questions).toEqual([
      { ...a, text: 'Edited A?' }, { ...b, askIf: ['a'] },
    ])
  })
})

describe('sync journal', () => {
  it('keeps edits made before an incoming cloud update', () => {
    const workspace = newWorkspace(base, user)
    const merged = acceptCloud({ ...workspace, data: firstEdit }, secondEdit, user)
    expect(merged.sync.base).toEqual(secondEdit)
    expect(merged.data.trips[0].checked).toEqual({ [pants]: true, [shirt]: true })
    expect(hasUnsyncedChanges(merged)).toBe(true)
  })

  it('preserves a newer local edit made while an earlier batch is in flight', () => {
    const workspace = makeBatch(firstEdit)
    const pending = workspace.sync.pending
    const local = toggleChecked(firstEdit, trip.id, pants)
    const cloud = mergeData(base, firstEdit, secondEdit)
    const acknowledged = acknowledgeBatch({ ...workspace, data: local }, pending, cloud)
    expect(acknowledged.sync.pending).toBeNull()
    expect(acknowledged.data.trips[0].checked).toEqual({ [shirt]: true })
    expect(hasUnsyncedChanges(acknowledged)).toBe(true)
  })

  it('never reapplies a committed batch after a newer batch from the same client', () => {
    const workspace = makeBatch(firstEdit)
    const first = planCloudWrite({ payload: secondEdit }, workspace.sync)
    expect(first.data.trips[0].checked).toEqual({ [pants]: true, [shirt]: true })
    const acknowledged = acknowledgeBatch(workspace, workspace.sync.pending, first.data)
    const next = prepareBatch({ ...acknowledged, data: toggleChecked(first.data, trip.id, pants) })
    const later = planCloudWrite(first.fields, next.sync)
    expect(later.data.trips[0].checked).toEqual({ [shirt]: true })
    expect(planCloudWrite(later.fields, workspace.sync, true)).toEqual({ data: later.data })
  })

  it('still recognizes receipts stored by an earlier build', () => {
    const workspace = makeBatch(firstEdit)
    const syncReceipts = { [workspace.sync.clientId]: workspace.sync.pending.id }
    expect(planCloudWrite({ payload: secondEdit, syncReceipts }, workspace.sync)).toEqual({ data: secondEdit })
  })

  it('preserves a deliberate backup replacement and then clears the replacement marker', () => {
    const workspace = newWorkspace(base, user)
    const restored = defaultData()
    const batch = prepareBatch({ data: restored, sync: { ...workspace.sync, replacement: 'restore-id' } })
    const cloud = planCloudWrite({ payload: secondEdit }, batch.sync).data
    const acknowledged = acknowledgeBatch(batch, batch.sync.pending, cloud)
    expect(cloud).toEqual(restored)
    expect(hasUnsyncedChanges(acknowledged)).toBe(false)
  })

  it('drops an old account’s pending edits when switching users', () => {
    const workspace = makeBatch(firstEdit)
    const other = acceptCloud(workspace, defaultData(), { uid: 'other' })
    expect(other.data.trips).toEqual([])
    expect(other.sync).toMatchObject({ uid: 'other', pending: null, replacement: null })
  })

  it('preserves legacy unsynced edits for manual resolution when their baseline is missing', () => {
    const workspace = newWorkspace(firstEdit, { ...user, dirty: true })
    expect(() => acceptCloud(workspace, secondEdit, user)).toThrow(expect.objectContaining({ code: 'legacy-dirty' }))
    expect(acceptCloud(workspace, firstEdit, user).sync.legacyDirty).toBe(false)
  })

  it('refuses to overwrite a cloud list from a newer app', () => {
    const workspace = makeBatch(firstEdit)
    expect(() => planCloudWrite({ payload: { ...base, version: base.version + 1 } }, workspace.sync))
      .toThrow(expect.objectContaining({ code: 'newer' }))
  })
})
