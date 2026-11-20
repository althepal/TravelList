// Pure data logic: no React, no Capacitor. Everything the app knows lives in one
// JSON document shaped like defaultData().

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

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

// ---------- dates (local calendar days as 'YYYY-MM-DD') ----------

export function todayStr(now = new Date()) {
  return dateStr(now)
}

export function dateStr(d) {
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

export function nightsOf(trip) {
  return Math.max(0, Math.round((parseDate(trip.end) - parseDate(trip.start)) / 86400000))
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
  const month = parseDate(trip.start).getMonth() + 1
  return {
    'auto:winter': month >= 11 || month <= 3,
    'auto:summer': month >= 5 && month <= 9,
    'auto:long': nightsOf(trip) + 1 > 3,
  }
}

// A condition is an auto condition ('auto:summer') or a question id, which
// holds when that question is asked on this trip and answered yes.
function conditionChecker(trip, questions) {
  const flags = autoFlags(trip)
  const askIfOf = (q) => [].concat(q.askIf ?? []).filter((c) => c !== q.id)
  // A question with `askIf` is only asked when any of those conditions holds,
  // e.g. "Swimming?" only when it's summer-ish or flying.
  const isAsked = (q) => askIfOf(q).length === 0 || askIfOf(q).some(holds)
  // An answer to a question that's no longer asked (dates moved) counts as no.
  const holds = (cond) => {
    if (cond.startsWith('auto:')) return !!flags[cond]
    const q = questions.find((x) => x.id === cond)
    return !!q && isAsked(q) && trip.answers[cond] === true
  }
  return { holds, isAsked }
}

export function isAsked(question, trip, questions) {
  return conditionChecker(trip, questions).isAsked(question)
}

// An item shows when its `requires` condition (if any) is true AND any of its
// `when` conditions is true (or `when` is empty). E.g. Max's bathing suit:
// requires Max, when Swimming.
export function appliesTo(template, trip, questions) {
  const { holds } = conditionChecker(trip, questions)
  if (template.requires && !holds(template.requires)) return false
  return template.when.length === 0 || template.when.some(holds)
}

export function conditionLabel(cond, questions) {
  const auto = AUTO_CONDITIONS.find((a) => a.id === cond)
  if (auto) return auto.text
  return questions.find((q) => q.id === cond)?.short ?? '?'
}

// Pack items under their headings, in PACK_GROUPS order; empty groups dropped.
export function groupPackItems(items) {
  return PACK_GROUPS
    .map((group) => ({ group, items: items.filter((i) => (i.group || 'Main') === group) }))
    .filter((g) => g.items.length > 0)
}

// ---------- trip checklist ----------

// A trip doesn't copy the master list: its items are computed live, so master
// list edits show up in trips you've already planned. Trip-only state is the
// answers, check marks, items hidden for this trip, and one-off extras.
export function tripItems(data, trip) {
  const nights = nightsOf(trip)
  const fromTemplates = data.templates
    .filter((t) => !trip.hidden[t.id] && appliesTo(t, trip, data.questions))
    .map((t) => ({
      key: `t:${t.id}`,
      templateId: t.id,
      category: t.category,
      text: t.text,
      group: t.group || 'Main',
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

// ---------- mutations (return new data; never mutate) ----------

export function updateTrip(data, tripId, fn) {
  return { ...data, trips: data.trips.map((t) => (t.id === tripId ? fn(t) : t)) }
}

export function toggleChecked(data, tripId, key) {
  return updateTrip(data, tripId, (t) => ({
    ...t,
    checked: { ...t.checked, [key]: !t.checked[key] },
  }))
}

export function makePermanent(data, tripId, extraId, when, requires = null) {
  const trip = data.trips.find((t) => t.id === tripId)
  const extra = trip.extras.find((x) => x.id === extraId)
  const template = { id: newId(), category: extra.category, text: extra.text, when, requires, perDay: false }
  const { [`x:${extraId}`]: wasChecked, ...checked } = trip.checked
  const next = { ...data, masterEdited: true, templates: [...data.templates, template] }
  return updateTrip(next, tripId, (t) => ({
    ...t,
    extras: t.extras.filter((x) => x.id !== extraId),
    checked: wasChecked ? { ...checked, [`t:${template.id}`]: true } : checked,
  }))
}

export function deleteQuestion(data, questionId) {
  return {
    ...data,
    masterEdited: true,
    questions: data.questions
      .filter((q) => q.id !== questionId)
      .map((q) => (q.askIf ? { ...q, askIf: [].concat(q.askIf).filter((c) => c !== questionId) } : q)),
    templates: data.templates.map((t) => ({
      ...t,
      when: t.when.filter((c) => c !== questionId),
      requires: t.requires === questionId ? null : t.requires,
    })),
  }
}

// Until you edit the master list yourself, saved data follows the latest
// starting list (so updates to it reach a browser that saved an older one).
export function refreshStarterList(data) {
  if (data.masterEdited) return data
  const fresh = defaultData()
  return { ...data, questions: fresh.questions, templates: fresh.templates }
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
        headingHome: t.headingHome,
        items: tripItems(data, t)
          .filter((i) => i.category === 'home' && !i.checked)
          .map((i) => i.text),
      })),
  }
}

// ---------- starter data ----------

export function defaultData() {
  const questions = [
    { id: 'max', text: 'Bringing Max?', short: 'Max' },
    { id: 'harrison', text: 'Going to Harrison?', short: 'Harrison' },
    { id: 'camping', text: 'Camping?', short: 'Camping' },
    { id: 'fly', text: 'Flying?', short: 'Flying' },
    { id: 'swim', text: 'Swimming?', short: 'Swimming', askIf: ['auto:summer', 'fly'] },
  ]
  // Ids come from the text so they stay put when the starting list changes.
  const t = (category, group, text, when = [], extra = {}) => ({
    id: `s-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    category, group, text, when, requires: null, perDay: false, ...extra,
  })
  const pack = (group, text, when, extra) => t('pack', group, text, when, extra)
  const max = { requires: 'max' }
  const perDay = { perDay: true }
  const templates = [
    pack('Main', 'Underwear', [], perDay),
    pack('Main', 'Socks', [], perDay),
    pack('Main', 'T-shirts', [], perDay),
    pack('Main', 'Shorts'),
    pack('Main', 'Sweatpants'),
    pack('Main', 'Sweatshirt'),
    pack('Main', 'Collar shirt'),
    pack('Main', 'Rain coat'),
    pack('Main', 'Sliders'),
    pack('Main', 'Bathing suit', ['swim']),

    pack('Main', 'Pills / Ambien'),
    pack('Main', 'Creatine'),
    pack('Main', 'Shots', ['auto:long']),
    pack('Main', 'Toothbrush & toothpaste'),

    pack('Main', 'Phone charger'),
    pack('Main', 'Headphones'),
    pack('Main', 'Laptop / case'),

    ...["Max's pants / shorts", "Max's shirts", "Max's underwear", "Max's socks"]
      .map((text) => pack('Max', text, [], { ...max, ...perDay })),
    ...["Max's pajamas", "Max's toothbrush", "Max's iPad", "Max's iPad charger"]
      .map((text) => pack('Max', text, [], max)),
    pack('Max', "Max's Crocs", [], max),
    pack('Max', "Max's bathing suit", ['swim'], max),

    ...['Sleeping bag', 'Sleeping pad', 'Tent', 'Pillow', 'Hiking boots', 'Teva shoes',
      'Headlamp', 'Flashlight', 'Knife', 'TP', 'Chair', 'Food', 'Electrolytes', 'Cup', 'Spoon',
      'Camelback', 'Bug spray',
    ].map((text) => pack('Camping', text, ['camping'])),
    pack('Camping', 'Hiking socks', ['camping'], perDay),

    pack('Main', 'Goggles', ['swim']),
    pack('Max', "Max's baseball glove", ['harrison'], max),

    pack('Main', 'Passports', ['fly']),
    pack('Main', 'Sunglasses', ['fly']),

    t('door', null, 'Turn off HVAC'),
    t('door', null, 'Turn off recirc pump'),
    t('door', null, 'Take out the trash'),
    t('door', null, 'Feed fish'),
    t('door', null, 'Set Chiller (Fish)', ['auto:summer']),
    t('door', null, 'Replace Filter Socks'),
    t('home', null, 'Turn the HVAC back on'),
    t('home', null, 'Turn the recirc pump back on'),
  ]
  return { version: 1, masterEdited: false, questions, templates, trips: [] }
}
