import { hasQuestionDependencyCycle, PACK_GROUPS } from './model'

const CATEGORIES = new Set(['pack', 'todo', 'door', 'home'])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasUniqueIds = (items) => new Set(items.map((item) => item.id)).size === items.length
const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

// Backups use the same versioned data shape as the app's on-device document.
// Return a readable error instead of accepting a partial file that could break
// the trip or checklist screens after import.
export function backupValidationError(data) {
  if (!isRecord(data) || data.version !== 1) return 'This is not a TravelList backup this version can read.'
  if (!Array.isArray(data.questions) || !Array.isArray(data.templates) || !Array.isArray(data.trips)) {
    return 'The backup is missing one or more TravelList lists.'
  }

  if (!data.questions.every((q) => isRecord(q) && typeof q.id === 'string' && typeof q.text === 'string' &&
    (q.askIf == null || typeof q.askIf === 'string' || (Array.isArray(q.askIf) && q.askIf.every((c) => typeof c === 'string'))),
  )) {
    return 'The backup has an invalid question.'
  }
  if (!hasUniqueIds(data.questions)) return 'The backup contains duplicate question IDs.'
  if (hasQuestionDependencyCycle(data.questions)) return 'The backup has follow-up questions that depend on each other in a loop.'

  if (!data.templates.every((item) =>
    isRecord(item) && typeof item.id === 'string' && CATEGORIES.has(item.category) &&
    typeof item.text === 'string' && Array.isArray(item.when) && item.when.every((c) => typeof c === 'string') &&
    (item.requires == null || typeof item.requires === 'string'),
  )) return 'The backup has an invalid master-list item.'
  if (!hasUniqueIds(data.templates)) return 'The backup contains duplicate item IDs.'

  if (!data.trips.every((trip) =>
    isRecord(trip) && typeof trip.id === 'string' && isDate(trip.start) &&
    isDate(trip.end) && trip.end >= trip.start && typeof trip.name === 'string' &&
    isRecord(trip.answers) && isRecord(trip.checked) && isRecord(trip.hidden) &&
    Array.isArray(trip.extras) &&
    trip.extras.every((item) => isRecord(item) && typeof item.id === 'string' &&
      CATEGORIES.has(item.category) && typeof item.text === 'string'),
  )) return 'The backup has an invalid trip or trip-only item.'
  if (!hasUniqueIds(data.trips)) return 'The backup contains duplicate trip IDs.'
  if (data.trips.some((trip) => !hasUniqueIds(trip.extras))) return 'A trip contains duplicate one-off item IDs.'

  return null
}

// Backups from earlier versions may omit fields introduced later. Normalize
// them before they enter the live app state so editors always receive a full
// model shape.
export function normalizeBackup(data) {
  return {
    ...data,
    masterEdited: true,
    questions: data.questions.map((question) => ({
      ...question,
      short: typeof question.short === 'string' && question.short.trim() ? question.short : question.text,
    })),
    templates: data.templates.map((item) => ({
      ...item,
      group: item.category === 'pack'
        ? (PACK_GROUPS.includes(item.group) ? item.group : 'Main')
        : null,
      perDay: item.perDay === true,
    })),
  }
}
