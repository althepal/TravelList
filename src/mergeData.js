import { deleteQuestion, deleteTemplate, questionDependencyCycle } from './model'

// Firestore can return object keys in a different order than local JSON.
export function equalValues(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equalValues(a[key], b[key]))
}

export function mergeFields(base, local, cloud) {
  const keys = new Set([...Object.keys(cloud), ...Object.keys(local)])
  const entries = []
  for (const key of keys) {
    const value = equalValues(base[key], local[key]) ? cloud[key] : local[key]
    if (value !== undefined) entries.push([key, value])
  }
  return Object.fromEntries(entries)
}

function indexItems(items) {
  // Older saved lists can contain duplicate IDs. Match those rows in order.
  const counts = new Map()
  return new Map(items.map((item) => {
    const occurrence = counts.get(item.id) ?? 0
    counts.set(item.id, occurrence + 1)
    return [JSON.stringify([item.id, occurrence]), item]
  }))
}

function mergeItems(base, local, cloud, merge = mergeFields) {
  const before = indexItems(base)
  const localItems = indexItems(local)
  const merged = []
  for (const [key, remote] of indexItems(cloud)) {
    const original = before.get(key)
    const edited = localItems.get(key)
    // A deletion on either client wins over edits to an existing item.
    if (original && edited) merged.push(merge(original, edited, remote))
    if (!original) merged.push(edited ?? remote)
    localItems.delete(key)
  }
  for (const [key, item] of localItems) {
    if (!before.has(key)) merged.push(item)
  }
  return merged
}

// The question fields that link it to other questions.
const pickDependencies = ({ askIf, autoYesIf }) => ({ askIf, autoYesIf })

function mergeQuestions(base, local, cloud) {
  const merged = mergeItems(base, local, cloud)
  if (!questionDependencyCycle(merged)) return merged

  // Keep the cloud dependencies (Only ask when and Auto yes when) for any
  // change that would introduce a loop. Question text and other independent
  // edits still merge.
  const cloudQuestions = indexItems(cloud)
  const questions = [...indexItems(merged)].map(([key, question]) => {
    const previous = cloudQuestions.get(key)
    return { ...question, ...(previous ? pickDependencies(previous) : { askIf: [], autoYesIf: [] }) }
  })
  for (const [index, question] of merged.entries()) {
    const previous = questions[index]
    if (equalValues(pickDependencies(previous), pickDependencies(question))) continue
    questions[index] = question
    if (questionDependencyCycle(questions, question.id)) questions[index] = previous
  }
  return questions
}

function deletedIds(before, after) {
  const remaining = new Set(after.map((item) => item.id))
  return before.filter((item) => !remaining.has(item.id)).map((item) => item.id)
}

export function mergeTemplate(base, local, cloud) {
  const template = mergeFields(base, local, cloud)
  return { ...template, group: template.category === 'pack' ? template.group ?? 'Main' : null }
}

export function mergeTrip(base, local, cloud) {
  // Keep the dates together so concurrent edits cannot create an invalid range.
  const dates = base.start === local.start && base.end === local.end ? cloud : local
  const extras = mergeItems(base.extras, local.extras, cloud.extras)
  const checked = mergeFields(base.checked, local.checked, cloud.checked)
  for (const id of deletedIds(base.extras, extras)) delete checked[`x:${id}`]
  return {
    ...mergeFields(base, local, cloud),
    start: dates.start,
    end: dates.end,
    answers: mergeFields(base.answers, local.answers, cloud.answers),
    checked,
    hidden: mergeFields(base.hidden, local.hidden, cloud.hidden),
    extras,
  }
}

// Apply the local changes since base to the latest server copy. A field changed
// on both devices takes the local value when this transaction commits.
export function mergeData(base, local, cloud) {
  if (equalValues(base, local)) return cloud
  if (equalValues(base, cloud)) return local
  let merged = {
    version: cloud.version,
    questions: mergeQuestions(base.questions, local.questions, cloud.questions),
    templates: mergeItems(base.templates, local.templates, cloud.templates, mergeTemplate),
    trips: mergeItems(base.trips, local.trips, cloud.trips, mergeTrip),
  }

  // Apply the same reference cleanup as a deletion made in the UI, including
  // references added on the other device after the deleted entity was seen.
  for (const id of deletedIds(base.questions, merged.questions)) merged = deleteQuestion(merged, id)
  for (const id of deletedIds(base.templates, merged.templates)) merged = deleteTemplate(merged, id)
  return merged
}
