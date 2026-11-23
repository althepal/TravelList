import { describe, expect, it } from 'vitest'
import {
  addExtra, comingHomeSnapshot, defaultData, deleteQuestion, deleteTemplate, groupPackItems, isAsked, isComingHome,
  makePermanent, newTemplate, nightsLabel, nightsOf, questionDependencyCycle, removeExtra, saveTemplate, setHidden,
  toggleChecked, tripItems,
} from './model'
import { plannedReminders } from './reminders'

// A 3-night December trip unless overridden.
function setup(tripPatch = {}) {
  const data = defaultData()
  const trip = {
    id: 'T', name: 'Tahoe', start: '2026-12-01', end: '2026-12-04',
    answers: {}, checked: {}, hidden: {}, extras: [],
    headingHome: false, ended: false, ...tripPatch,
  }
  return { ...data, trips: [trip] }
}
const summer = { start: '2026-07-01', end: '2026-07-04' }
const idOf = (data, text) => data.templates.find((t) => t.text === text).id
const texts = (data) => tripItems(data, data.trips[0]).map((i) => i.text)
const qty = (data, text) => tripItems(data, data.trips[0]).find((i) => i.text === text).qty

describe('tripItems', () => {
  it('includes the everyday basics with no questions answered', () => {
    const t = texts(setup())
    for (const item of ['Laptop / case', 'Rain coat', 'Underwear', 'Turn off HVAC', 'Pills / Ambien']) expect(t).toContain(item)
    for (const item of ['Sunglasses', 'Laptop charger', 'Wallet & keys', 'Testosterone', 'Jacket', 'Snacks', 'Stool'])
      expect(t).not.toContain(item)
  })

  it('groups Pack items under headings in order', () => {
    const data = setup({ answers: { max: true } })
    const groups = groupPackItems(tripItems(data, data.trips[0]).filter((i) => i.category === 'pack'))
    expect(groups.map((g) => g.group)).toEqual(['Main', 'Max'])
  })

  it('adds shots only for trips longer than 3 days', () => {
    expect(texts(setup({ start: '2026-12-01', end: '2026-12-03' }))).not.toContain('Shots') // 3 days
    expect(texts(setup())).toContain('Shots') // 4 days
  })

  it('counts per-day items as nights + 1', () => {
    const data = setup()
    expect(nightsOf(data.trips[0])).toBe(3)
    expect(qty(data, 'Underwear')).toBe(4)
  })

  it('adds camp gear when camping / backpacking', () => {
    expect(texts(setup())).not.toContain('Pillow')
    const t = texts(setup({ answers: { camping: true } }))
    expect(t).toContain('Pillow')
    expect(t).toContain('Camelback')
    expect(t).toContain('Bug spray')
    expect(t).toContain('Electrolytes')
    expect(t.filter((x) => x === 'Sleeping bag')).toHaveLength(1)
  })

  it('adds passports and sunglasses when flying and the mitt for Harrison\'s', () => {
    expect(texts(setup({ answers: { fly: true } }))).toEqual(expect.arrayContaining(['Passports', 'Sunglasses']))
    expect(texts(setup({ answers: { harrison: true } }))).not.toContain("Max's baseball mitt")
    expect(texts(setup({ answers: { harrison: true, max: true } }))).toContain("Max's baseball mitt")
    expect(texts(setup({ answers: { max: true } }))).not.toContain("Max's baseball mitt")
  })

  it("adds Max's things only when Max comes", () => {
    expect(texts(setup())).not.toContain("Max's iPad")
    const data = setup({ answers: { max: true } })
    expect(texts(data)).toContain("Max's iPad")
    expect(qty(data, "Max's shirts")).toBe(4)
  })

  it('asks Swimming only when summer-ish or flying', () => {
    const swim = defaultData().questions.find((q) => q.id === 'swim')
    const q = defaultData().questions
    expect(isAsked(swim, setup().trips[0], q)).toBe(false) // December, not flying
    expect(isAsked(swim, setup(summer).trips[0], q)).toBe(true)
    expect(isAsked(swim, setup({ answers: { fly: true } }).trips[0], q)).toBe(true)
  })

  it('treats a trip that overlaps May as summer', () => {
    const questions = defaultData().questions
    const trip = { ...setup().trips[0], start: '2026-04-28', end: '2026-05-02' }
    expect(isAsked(questions.find((q) => q.id === 'swim'), trip, questions)).toBe(true)
    expect(texts(setup({ start: trip.start, end: trip.end }))).toContain('Set Chiller (Fish)')
  })

  it('bathing suits come with swimming, when Swimming is asked', () => {
    expect(texts(setup({ ...summer, answers: { swim: true } }))).toContain('Bathing suit')
    expect(texts(setup({ answers: { swim: true, fly: true } }))).toContain('Bathing suit')
    expect(texts(setup({ answers: { swim: true } }))).not.toContain('Bathing suit') // December, not flying
    expect(texts(setup({ ...summer, answers: { harrison: true } }))).not.toContain('Bathing suit')
    expect(texts(setup({ ...summer, answers: { swim: true, max: true } }))).toContain("Max's bathing suit")
  })

  it('hides items skipped for this trip and adds one-offs', () => {
    const data = setup({
      hidden: { [idOf(defaultData(), 'Phone charger')]: true },
      extras: [{ id: 'x1', category: 'pack', text: 'Ski boots' }],
    })
    expect(texts(data)).not.toContain('Phone charger')
    expect(texts(data)).toContain('Ski boots')
  })
})

describe('makePermanent', () => {
  it('moves a one-off to the master list and keeps its check mark', () => {
    let data = setup({ extras: [{ id: 'x1', category: 'pack', text: 'Ski boots' }] })
    data = toggleChecked(data, 'T', 'x:x1')
    const template = newTemplate('pack', { text: 'Ski boots', when: ['auto:winter'], requires: 'max', group: 'Max', perDay: true })
    data = makePermanent(data, 'T', 'x1', template)
    expect(data.templates.at(-1)).toEqual(template)
    expect(data.trips[0].extras).toEqual([])
    expect(data.trips[0].checked).toEqual({ [`t:${template.id}`]: true })
    data = { ...data, trips: [{ ...data.trips[0], answers: { max: true } }] }
    expect(tripItems(data, data.trips[0]).find((i) => i.text === 'Ski boots')).toMatchObject({ checked: true, group: 'Max', qty: 4 })
  })
})

describe('edits', () => {
  it('saveTemplate adds a new item and replaces an existing one in place', () => {
    const data = setup()
    const added = saveTemplate(data, newTemplate('door', { text: 'Lock up' }))
    expect(added.templates.at(-1).text).toBe('Lock up')
    const renamed = saveTemplate(added, { ...added.templates[0], text: 'Undies' })
    expect(renamed.templates.map((t) => t.text).slice(0, 2)).toEqual(['Undies', 'Socks'])
    expect(renamed.templates).toHaveLength(added.templates.length)
  })

  it('deleteTemplate also clears its check marks and skips on every trip', () => {
    const id = idOf(defaultData(), 'Socks')
    let data = setup({ checked: { [`t:${id}`]: true, 't:other': true }, hidden: { [id]: true } })
    data = deleteTemplate(data, id)
    expect(data.templates.some((t) => t.id === id)).toBe(false)
    expect(data.trips[0].checked).toEqual({ 't:other': true })
    expect(data.trips[0].hidden).toEqual({})
  })

  it('setHidden skips an item for one trip and restores it without leaving a key behind', () => {
    const id = idOf(defaultData(), 'Socks')
    const hidden = setHidden(setup(), 'T', id, true)
    expect(texts(hidden)).not.toContain('Socks')
    const restored = setHidden(hidden, 'T', id, false)
    expect(restored.trips[0].hidden).toEqual({})
    expect(texts(restored)).toContain('Socks')
  })

  it('removeExtra also clears its check mark', () => {
    let data = addExtra(setup(), 'T', 'pack', 'Ski boots')
    const extraId = data.trips[0].extras[0].id
    data = toggleChecked(data, 'T', `x:${extraId}`)
    data = removeExtra(data, 'T', extraId)
    expect(data.trips[0].extras).toEqual([])
    expect(data.trips[0].checked).toEqual({})
  })

  it('unchecking removes the check mark', () => {
    const data = toggleChecked(toggleChecked(setup(), 'T', 't:a'), 'T', 't:a')
    expect(data.trips[0].checked).toEqual({})
  })
})

describe('deleteQuestion', () => {
  it('removes the question from item conditions, "only if", follow-ups and answers', () => {
    const data = deleteQuestion(deleteQuestion(setup({ answers: { max: true, fly: false } }), 'fly'), 'max')
    expect(data.templates.find((t) => t.text === 'Passports').when).toEqual([])
    expect(data.templates.find((t) => t.text === "Max's bathing suit"))
      .toMatchObject({ when: ['swim', 'harrison'], requires: null })
    expect(data.questions.find((q) => q.id === 'swim').askIf).toEqual(['auto:summer'])
    expect(data.trips[0].answers).toEqual({})
  })
})

describe('nightsLabel', () => {
  it('says day trip, 1 night, or N nights', () => {
    expect(nightsLabel({ start: '2026-12-01', end: '2026-12-01' })).toBe('day trip')
    expect(nightsLabel({ start: '2026-12-01', end: '2026-12-02' })).toBe('1 night')
    expect(nightsLabel({ start: '2026-12-01', end: '2026-12-04' })).toBe('3 nights')
  })
})

describe('coming home', () => {
  it('starts on the last day, or early when heading home, and stops when ended', () => {
    const trip = setup().trips[0]
    expect(isComingHome(trip, '2026-12-03')).toBe(false)
    expect(isComingHome(trip, '2026-12-04')).toBe(true)
    expect(isComingHome({ ...trip, headingHome: true }, '2026-12-02')).toBe(true)
    expect(isComingHome({ ...trip, ended: true }, '2026-12-05')).toBe(false)
  })

  it('snapshot lists unchecked coming-home items for open trips', () => {
    let data = setup()
    expect(comingHomeSnapshot(data).trips[0]).toMatchObject({
      end: '2026-12-04', remindUntil: '2026-12-07',
      items: ['Turn the HVAC back on', 'Turn the recirc pump back on'],
    })
    data = toggleChecked(data, 'T', `t:${idOf(data, 'Turn the HVAC back on')}`)
    expect(comingHomeSnapshot(data).trips[0].items).toEqual(['Turn the recirc pump back on'])
  })
})

describe('plannedReminders', () => {
  it('schedules an 8am last-day reminder with unchecked Coming Home items', () => {
    const home = plannedReminders(setup(), new Date(2026, 10, 20)).find((r) => r.title.startsWith('Last day'))
    expect(home.at).toEqual(new Date(2026, 11, 4, 8))
    expect(home.body).toBe('Turn the HVAC back on\nTurn the recirc pump back on')
  })

  it('schedules an 8pm car-charge reminder the night before the trip', () => {
    const plan = plannedReminders(setup(), new Date(2026, 10, 20))
    expect(plan).toHaveLength(2)
    const car = plan.find((r) => r.title === 'Charge the car for Tahoe')
    expect(car.at).toEqual(new Date(2026, 10, 30, 20))
    expect(car.id).not.toBe(plan.find((r) => r !== car).id)
    // Once that evening has passed, only the last-day reminder is left.
    expect(plannedReminders(setup(), new Date(2026, 11, 1))).toHaveLength(1)
  })

  it('skips reminders in the past and for ended trips', () => {
    expect(plannedReminders(setup(), new Date(2026, 11, 10))).toEqual([])
    expect(plannedReminders(setup({ ended: true }), new Date(2026, 10, 20))).toEqual([])
  })
})

describe('starter list', () => {
  it('has unique, text-based ids', () => {
    const ids = defaultData().templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('questionDependencyCycle', () => {
  const q = (id, askIf = []) => ({ id, text: `${id}?`, short: id, askIf })
  const loop = [q('a', ['b']), q('b', ['a', 'auto:summer']), q('c')]

  it('finds a loop and ignores self-dependencies and auto conditions', () => {
    expect(questionDependencyCycle(loop)).toEqual(['a', 'b', 'a'])
    expect(questionDependencyCycle([q('a', ['a', 'auto:winter']), q('b', ['a'])])).toBeNull()
    expect(questionDependencyCycle(defaultData().questions)).toBeNull()
  })

  it('with a start question, reports only loops through it', () => {
    expect(questionDependencyCycle(loop, 'a')).toEqual(['a', 'b', 'a'])
    expect(questionDependencyCycle(loop, 'c')).toBeNull()
    expect(questionDependencyCycle([...loop.slice(0, 2), q('c', ['a'])], 'c')).toBeNull()
    expect(questionDependencyCycle([q('a', ['c']), q('b', ['a']), q('c', ['b'])], 'c')).toEqual(['c', 'b', 'a', 'c'])
  })

  it('stays fast when many questions share follow-ups', () => {
    const dense = Array.from({ length: 200 }, (_, i) => q(`q${i}`, Array.from({ length: i }, (_, j) => `q${j}`)))
    const started = Date.now()
    expect(questionDependencyCycle(dense)).toBeNull()
    expect(questionDependencyCycle(dense, 'q199')).toBeNull()
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('keeps a looped question from hanging the trip checklist', () => {
    const data = { ...setup({ answers: { a: true, b: true } }), questions: loop }
    expect(isAsked(loop[0], data.trips[0], loop)).toBe(false) // December: b's summer condition is off
  })
})
