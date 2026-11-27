import { starterLists } from './starter'

// Pure data logic: no React, no Capacitor. Everything the app knows lives in one
// JSON document shaped like defaultData(). Data from disk, the cloud or a
// backup goes through parseData (parseData.js) first, so every field below is
// always present.

// Bump when the document's shape changes, and add a matching upgrade step in
// parseData.js. A build refuses to sync with a cloud copy newer than this.
export const DATA_VERSION = 4

export const CATEGORIES = [
  { id: 'pack', label: 'Pack', empty: 'Nothing to pack yet.' },
  { id: 'todo', label: 'To Do', empty: 'No tasks.' },
  { id: 'door', label: 'Out the Door', empty: 'No checks.' },
  { id: 'home', label: 'Coming Home', empty: 'No coming-home reminders.' },
]

// Headings the Pack list is grouped under, in display order.
export const PACK_GROUPS = ['Main', 'Max', 'Camping']

// Conditions computed from the trip itself rather than asked.
export const AUTO_CONDITIONS = [
  { id: 'auto:winter', text: 'Winter (Nov–Mar)' },
  { id: 'auto:summer', text: 'Summer-ish (May–Sep)' },
  { id: 'auto:long', text: 'More than 3 days' },
]
export const NEVER_CONDITION = { id: 'auto:never', text: 'Never' }

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)
}

// ---------- dates (local calendar days as 'YYYY-MM-DD') ----------

export function todayStr(now = new Date()) {
  return dateStr(now)
}

function dateStr(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s, n) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

// Whole days from one date to another (negative if `to` is earlier).
export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000)
}

export function nightsOf(trip) {
  return Math.max(0, daysBetween(trip.start, trip.end))
}

// 'day trip', '1 night', '3 nights'
export function nightsLabel(trip) {
  const nights = nightsOf(trip)
  if (nights === 0) return 'day trip'
  return `${nights} night${nights > 1 ? 's' : ''}`
}

export function formatRange(trip) {
  const opts = { month: 'short', day: 'numeric' }
  const a = parseDate(trip.start).toLocaleDateString(undefined, opts)
  if (trip.start === trip.end) return a
  const b = parseDate(trip.end).toLocaleDateString(undefined, opts)
  return `${a} – ${b}`
}

// ---------- conditions ----------

function autoFlags(trip) {
  const start = parseDate(trip.start)
  const end = parseDate(trip.end)
  const startMonth = start.getFullYear() * 12 + start.getMonth()
  const endMonth = end.getFullYear() * 12 + end.getMonth()
  const overlapsMonths = (months) => {
    // A trip spanning at least a full year necessarily overlaps each season.
    if (endMonth - startMonth >= 11) return true
    for (let month = startMonth; month <= endMonth; month += 1) {
      if (months.includes(((month % 12) + 12) % 12 + 1)) return true
    }
    return false
  }
  return {
    'auto:winter': overlapsMonths([11, 12, 1, 2, 3]),
    'auto:summer': overlapsMonths([5, 6, 7, 8, 9]),
    'auto:long': nightsOf(trip) + 1 > 3,
  }
}

// The conditions a question's other settings depend on: `askIf` (only ask
// when any holds) and `autoYesIf` (count as yes, without asking, when any holds).
export const questionDependencies = (q) => [...q.askIf, ...q.autoYesIf]

// Answers a trip's condition questions. Build it once per trip and reuse it
// for every item and question.
//
// A condition is an auto condition ('auto:summer') or a question id, which
// holds when that question is automatically yes on this trip, or is asked and
// answered yes.
export function tripConditions(trip, questions) {
  const flags = autoFlags(trip)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const cache = new Map()
  const evaluating = new Set()
  // Treat any malformed dependency cycle as false instead of recursing
  // forever. The editor, imports and sync also reject new cycles.
  const once = (key, compute) => {
    if (cache.has(key)) return cache.get(key)
    if (evaluating.has(key)) return false
    evaluating.add(key)
    const result = compute()
    evaluating.delete(key)
    cache.set(key, result)
    return result
  }
  // e.g. "Swimming?" counts as yes, and isn't asked, when going to Harrison.
  // Nothing is saved, so the usual rules and answer return if Harrison stops matching.
  const isAutoYes = (q) => once(`yes:${q.id}`, () =>
    q.autoYesIf.some((c) => c !== q.id && holds(c)))
  // A question with `askIf` is only asked when any of those conditions holds,
  // e.g. "Swimming?" only when it's summer-ish or flying.
  const meetsAskIf = (q) => once(`ask:${q.id}`, () => {
    const conditions = q.askIf.filter((c) => c !== q.id)
    return conditions.length === 0 || conditions.some(holds)
  })
  // An answer to a question that's no longer asked (dates moved) counts as no.
  const holds = (cond) => {
    if (cond.startsWith('auto:')) return !!flags[cond]
    const q = byId.get(cond)
    return !!q && (isAutoYes(q) || (meetsAskIf(q) && trip.answers[cond] === true))
  }

  // Match every condition in at least one group. No groups means every trip.
  const applies = (template) =>
    template.conditionGroups.length === 0 || template.conditionGroups.some(({ all }) => all.every(holds))
  return {
    holds,
    isAsked: (q) => !isAutoYes(q) && meetsAskIf(q),
    applies,
  }
}

// Returns a loop of question ids (first id repeated at the end, e.g.
// ['a', 'b', 'a']) or null, following both `askIf` and `autoYesIf`. With
// `startId`, only loops through that question count. Each question is explored
// once, so this stays linear in the number of questions and conditions however
// they're linked.
export function questionDependencyCycle(questions, startId) {
  const byId = new Map(questions.map((question) => [question.id, question]))
  // Like the trip evaluator, ignore a question depending on itself.
  const depsOf = (id) => questionDependencies(byId.get(id)).filter((c) =>
    c !== id && !c.startsWith('auto:') && byId.has(c))
  const onPath = new Set()
  const explored = new Set() // fully searched; no reportable loop from here
  const path = []
  const visit = (id) => {
    onPath.add(id)
    path.push(id)
    for (const dep of depsOf(id)) {
      if (onPath.has(dep)) {
        if (startId == null || dep === startId) return [...path.slice(path.indexOf(dep)), dep]
      } else if (!explored.has(dep)) {
        const cycle = visit(dep)
        if (cycle) return cycle
      }
    }
    path.pop()
    onPath.delete(id)
    explored.add(id)
    return null
  }
  if (startId != null) return byId.has(startId) ? visit(startId) : null
  for (const question of questions) {
    if (explored.has(question.id)) continue
    const cycle = visit(question.id)
    if (cycle) return cycle
  }
  return null
}

export function isAsked(question, trip, questions) {
  return tripConditions(trip, questions).isAsked(question)
}

export function conditionLabel(cond, questions) {
  if (cond === NEVER_CONDITION.id) return NEVER_CONDITION.text
  const auto = AUTO_CONDITIONS.find((a) => a.id === cond)
  if (auto) return auto.text
  return questions.find((q) => q.id === cond)?.short ?? '?'
}

// Pack items under their headings, in PACK_GROUPS order; empty groups dropped.
export function groupPackItems(items) {
  return PACK_GROUPS
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)
}

// ---------- trip checklist ----------

// A trip doesn't copy the master list: its items are computed live, so master
// list edits show up in trips you've already planned. Trip-only state is the
// answers, check marks, items hidden for this trip, and one-off extras.
export function tripItems(data, trip) {
  const nights = nightsOf(trip)
  const { applies } = tripConditions(trip, data.questions)
  const fromTemplates = data.templates
    .filter((t) => !trip.hidden[t.id] && applies(t))
    .map((t) => ({
      key: `t:${t.id}`,
      templateId: t.id,
      category: t.category,
      text: t.text,
      group: t.group,
      qty: t.perDay ? nights + 1 : null,
      checked: !!trip.checked[`t:${t.id}`],
    }))
  const extras = trip.extras.map((x) => ({
    key: `x:${x.id}`,
    extraId: x.id,
    category: x.category,
    text: x.text,
    group: 'Main',
    qty: null,
    checked: !!trip.checked[`x:${x.id}`],
  }))
  return [...fromTemplates, ...extras]
}

export function isComingHome(trip, today = todayStr()) {
  return !trip.ended && (trip.headingHome || today >= trip.end)
}

export function tripStatus(trip, today = todayStr()) {
  if (trip.ended) return 'past'
  if (today < trip.start) return 'upcoming'
  return 'active'
}

// ---------- edits (return new data; never mutate) ----------

const upsert = (list, item) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

const without = (record, key) => {
  if (!(key in record)) return record
  const { [key]: _removed, ...rest } = record
  return rest
}

export function updateTrip(data, tripId, fn) {
  return { ...data, trips: data.trips.map((t) => (t.id === tripId ? fn(t) : t)) }
}

export function saveTrip(data, trip) {
  return { ...data, trips: upsert(data.trips, trip) }
}

export function deleteTrip(data, tripId) {
  return { ...data, trips: data.trips.filter((t) => t.id !== tripId) }
}

export function toggleChecked(data, tripId, key) {
  return updateTrip(data, tripId, (t) => ({
    ...t,
    checked: t.checked[key] ? without(t.checked, key) : { ...t.checked, [key]: true },
  }))
}

// "Not needed this trip" (hidden) or restored.
export function setHidden(data, tripId, templateId, hidden) {
  return updateTrip(data, tripId, (t) => ({
    ...t,
    hidden: hidden ? { ...t.hidden, [templateId]: true } : without(t.hidden, templateId),
  }))
}

export function addExtra(data, tripId, category, text) {
  return updateTrip(data, tripId, (t) => ({ ...t, extras: [...t.extras, { id: newId(), category, text }] }))
}

export function removeExtra(data, tripId, extraId) {
  return updateTrip(data, tripId, (t) => ({
    ...t,
    extras: t.extras.filter((x) => x.id !== extraId),
    checked: without(t.checked, `x:${extraId}`),
  }))
}

export function saveTemplate(data, template) {
  return { ...data, templates: upsert(data.templates, template) }
}

// Removed from the master list and from every trip's check marks and skips.
export function deleteTemplate(data, templateId) {
  return {
    ...data,
    templates: data.templates.filter((t) => t.id !== templateId),
    trips: data.trips.map((t) => ({
      ...t,
      checked: without(t.checked, `t:${templateId}`),
      hidden: without(t.hidden, templateId),
    })),
  }
}

// Turns a trip's one-off into a master list item (`template`, already edited
// by the user), keeping its check mark on this trip.
export function makePermanent(data, tripId, extraId, template) {
  const trip = data.trips.find((t) => t.id === tripId)
  const wasChecked = !!trip.checked[`x:${extraId}`]
  const next = removeExtra(saveTemplate(data, template), tripId, extraId)
  if (!wasChecked) return next
  return updateTrip(next, tripId, (t) => ({ ...t, checked: { ...t.checked, [`t:${template.id}`]: true } }))
}

export function saveQuestion(data, question) {
  return { ...data, questions: upsert(data.questions, question) }
}

// Losing the last group leaves the item off trip lists. An item with no rules
// to begin with still goes on every trip.
export function filterConditionGroups(groups, keep) {
  const remaining = groups.filter(keep)
  return groups.length > 0 && remaining.length === 0 ? [{ all: [NEVER_CONDITION.id] }] : remaining
}

// A draft opened before sync deleted a question can still name it. Saving
// applies the same cleanup as the deletion; auto conditions always exist.
const conditionExists = (questions) => {
  const ids = new Set(questions.map((q) => q.id))
  return (cond) => cond.startsWith('auto:') || ids.has(cond)
}

export function withExistingConditions(question, questions) {
  const exists = conditionExists(questions)
  return { ...question, askIf: question.askIf.filter(exists), autoYesIf: question.autoYesIf.filter(exists) }
}

export function templateWithExistingConditions(template, questions) {
  const exists = conditionExists(questions)
  return { ...template, conditionGroups: filterConditionGroups(template.conditionGroups, ({ all }) => all.every(exists)) }
}

export function deleteQuestion(data, questionId) {
  return {
    ...data,
    questions: data.questions
      .filter((q) => q.id !== questionId)
      .map((q) => ({
        ...q,
        askIf: q.askIf.filter((c) => c !== questionId),
        autoYesIf: q.autoYesIf.filter((c) => c !== questionId),
      })),
    templates: data.templates.map((t) => ({
      ...t,
      conditionGroups: filterConditionGroups(t.conditionGroups, ({ all }) => !all.includes(questionId)),
    })),
    trips: data.trips.map((t) => ({ ...t, answers: without(t.answers, questionId) })),
  }
}

// ---------- new things ----------

export function newTemplate(category, fields = {}) {
  return {
    id: newId(), category, text: '', conditionGroups: [],
    group: category === 'pack' ? 'Main' : null, perDay: false,
    ...fields,
  }
}

export function newQuestion() {
  return { id: newId(), text: '', short: '', askIf: [], autoYesIf: [] }
}

export function newTrip(today = todayStr()) {
  return {
    id: newId(),
    name: '',
    start: addDays(today, 7),
    end: addDays(today, 10),
    answers: {}, // questionId -> true/false; unanswered until the user picks
    checked: {},
    hidden: {},
    extras: [],
    headingHome: false,
    ended: false,
  }
}

export function defaultData() {
  return { version: DATA_VERSION, ...starterLists(), trips: [] }
}

// ---------- what the iOS Shortcuts action reads ----------

// Written beside the main file so the native "Coming Home" action can stay a
// dumb reader: it only needs to compare dates, not understand templates.
export function comingHomeSnapshot(data) {
  return {
    trips: data.trips
      .filter((t) => !t.ended)
      .map((t) => ({
        name: t.name,
        end: t.end,
        remindUntil: addDays(t.end, 3),
        headingHome: t.headingHome,
        items: tripItems(data, t)
          .filter((i) => i.category === 'home' && !i.checked)
          .map((i) => i.text),
      })),
  }
}
