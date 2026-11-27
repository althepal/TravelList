import { CATEGORIES, DATA_VERSION, PACK_GROUPS, filterConditionGroups, questionDependencyCycle } from './model'

// The one way data enters the app, whether it comes from disk, the cloud or a
// backup: check it, upgrade it to DATA_VERSION, fill in defaults. Everything
// after this can rely on every field being present.

export class DataError extends Error {
  // code: 'invalid', or 'newer' when a newer build of the app wrote it
  constructor(message, code = 'invalid') {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}

export function parseData(raw, { imported = false } = {}) {
  if (!isRecord(raw) || !Number.isInteger(raw.version) || raw.version < 1) {
    throw new DataError("This isn't TravelList data.")
  }
  if (raw.version > DATA_VERSION) {
    throw new DataError('This list was saved by a newer version of TravelList.', 'newer')
  }
  const problem = shapeProblem(raw)
  if (problem) throw new DataError(problem)

  let data = raw
  for (let version = raw.version; version < DATA_VERSION; version += 1) {
    data = UPGRADES[version](data)
  }
  data = withDefaults(data)
  // The app copes with these (a looped question counts as not asked), so only
  // a backup being imported is refused for them, never the list already in use.
  const importProblem = imported && integrityProblem(data)
  if (importProblem) throw new DataError(importProblem)
  return data
}

// ---------- upgrades: UPGRADES[n] turns version n into version n + 1 ----------

const UPGRADES = {
  // 2: the starter list stopped updating itself, so its bookkeeping goes.
  1: ({ masterEdited, starterRevision, ...data }) => ({ ...data, version: 2 }),
  2: (data) => {
    // Harrison will include swimming (see version 4), so the two old
    // alternatives can be combined, unless that link can't be added.
    const combineHarrison = linkSwimAtHarrison(data.questions) !== null
    const templates = data.templates.map(({ when, requires, ...template }) => {
      const required = requires ? [requires] : []
      if (when.length === 0 || when.includes(requires)) {
        return { ...template, conditionGroups: required.length ? [{ all: required }] : [] }
      }
      const alternatives = combineHarrison && when.includes('swim')
        ? when.filter((condition) => condition !== 'harrison')
        : when
      return {
        ...template,
        conditionGroups: [...new Set(alternatives)].map((condition) => ({ all: [...required, condition] })),
      }
    })
    return { ...data, version: 3, templates }
  },
  // 4: "Harrison means Swimming is yes" was built into the app. It becomes the
  // Swimming question's own Auto yes rule, which the user can see and remove.
  // Version 3 lists may have dropped Harrison from item rules relying on it.
  // Runs once, so a removed rule stays removed.
  3: (data) => ({ ...data, version: 4, questions: linkSwimAtHarrison(data.questions) ?? data.questions }),
}

// Add the built-in rule alongside existing rules if the link is cycle-free.
function linkSwimAtHarrison(questions) {
  const has = (id) => questions.some((q) => q.id === id)
  if (!has('swim') || !has('harrison')) return null
  // Runs before withDefaults, so fill in the lists the cycle check reads.
  const linked = questions.map((q) => {
    const autoYesIf = q.autoYesIf ?? []
    return {
      ...q,
      askIf: [].concat(q.askIf ?? []),
      autoYesIf: q.id === 'swim' && !autoYesIf.includes('harrison') ? [...autoYesIf, 'harrison'] : autoYesIf,
    }
  })
  return questionDependencyCycle(linked, 'swim') ? null : linked
}

// ---------- defaults for fields older data may omit ----------

function withDefaults(data) {
  return {
    version: DATA_VERSION,
    questions: data.questions.map((q) => ({
      ...q,
      short: typeof q.short === 'string' && q.short.trim() ? q.short : q.text,
      askIf: [].concat(q.askIf ?? []),
      autoYesIf: q.autoYesIf ?? [],
    })),
    templates: data.templates.map((t) => ({
      ...t,
      // The editor never saves an empty group, so drop any a damaged copy has.
      conditionGroups: filterConditionGroups(t.conditionGroups, ({ all }) => all.length > 0),
      group: t.category === 'pack' ? (PACK_GROUPS.includes(t.group) ? t.group : 'Main') : null,
      perDay: t.perDay === true,
    })),
    trips: data.trips.map((trip) => ({
      ...trip,
      headingHome: trip.headingHome === true,
      ended: trip.ended === true,
    })),
  }
}

// ---------- shape checks (any version) ----------

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id))
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isStringList = (value) => Array.isArray(value) && value.every((c) => typeof c === 'string')
const isConditionGroups = (value) => Array.isArray(value) && value.every((group) =>
  isRecord(group) && isStringList(group.all))
const hasUniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length
const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

// A readable reason the data can't be used, or null. Catching it here keeps a
// partial or damaged list from breaking the trip or checklist screens.
// Only checks the screens depend on: refusing more would lock the user out.
function shapeProblem(data) {
  if (!Array.isArray(data.questions) || !Array.isArray(data.templates) || !Array.isArray(data.trips)) {
    return 'The list is missing its questions, items, or trips.'
  }

  if (!data.questions.every((q) => isRecord(q) && typeof q.id === 'string' && typeof q.text === 'string' &&
    (q.askIf == null || typeof q.askIf === 'string' || isStringList(q.askIf)) &&
    (q.autoYesIf == null || isStringList(q.autoYesIf)),
  )) return 'The list has an invalid question.'

  if (!data.templates.every((item) =>
    isRecord(item) && typeof item.id === 'string' && CATEGORY_IDS.has(item.category) &&
    typeof item.text === 'string' && (data.version < 3
      ? isStringList(item.when) && (item.requires == null || typeof item.requires === 'string')
      : isConditionGroups(item.conditionGroups)),
  )) return 'The list has an invalid master-list item.'

  if (!data.trips.every((trip) =>
    isRecord(trip) && typeof trip.id === 'string' && isDate(trip.start) &&
    isDate(trip.end) && trip.end >= trip.start && typeof trip.name === 'string' &&
    isRecord(trip.answers) && isRecord(trip.checked) && isRecord(trip.hidden) &&
    Array.isArray(trip.extras) &&
    trip.extras.every((item) => isRecord(item) && typeof item.id === 'string' &&
      CATEGORY_IDS.has(item.category) && typeof item.text === 'string'),
  )) return 'The list has an invalid trip or trip-only item.'

  return null
}

// Stricter checks for a backup about to replace the list.
function integrityProblem(data) {
  if (!hasUniqueIds(data.questions)) return 'The list has two questions with the same ID.'
  if (!hasUniqueIds(data.templates)) return 'The list has two master-list items with the same ID.'
  if (!hasUniqueIds(data.trips)) return 'The list has two trips with the same ID.'
  if (data.trips.some((trip) => !hasUniqueIds(trip.extras))) return 'A trip has two one-off items with the same ID.'
  if (questionDependencyCycle(data.questions)) return 'The list has questions that depend on each other in a loop.'
  return null
}
