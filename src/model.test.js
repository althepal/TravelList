import { describe, expect, it } from 'vitest'
import {
  comingHomeSnapshot, defaultData, deleteQuestion, groupPackItems, isAsked, isComingHome, makePermanent,
  nightsOf, refreshStarterList, toggleChecked, tripItems,
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

  it('adds passports and sunglasses when flying and the glove for Harrison\'s', () => {
    expect(texts(setup({ answers: { fly: true } }))).toEqual(expect.arrayContaining(['Passports', 'Sunglasses']))
    expect(texts(setup({ answers: { harrison: true } }))).not.toContain("Max's baseball glove")
    expect(texts(setup({ answers: { harrison: true, max: true } }))).toContain("Max's baseball glove")
    expect(texts(setup({ answers: { max: true } }))).not.toContain("Max's baseball glove")
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
    data = makePermanent(data, 'T', 'x1', ['auto:winter'], 'max')
    expect(data.templates.find((t) => t.text === 'Ski boots')).toMatchObject({ when: ['auto:winter'], requires: 'max' })
    expect(data.trips[0].extras).toEqual([])
    data = { ...data, trips: [{ ...data.trips[0], answers: { max: true } }] }
    expect(tripItems(data, data.trips[0]).find((i) => i.text === 'Ski boots').checked).toBe(true)
  })
})

describe('deleteQuestion', () => {
  it('removes the question from item conditions and "only if"', () => {
    const data = deleteQuestion(deleteQuestion(setup(), 'swim'), 'max')
    expect(data.templates.find((t) => t.text === 'Goggles').when).toEqual([])
    expect(data.templates.find((t) => t.text === "Max's bathing suit"))
      .toMatchObject({ when: [], requires: null })
    expect(data.masterEdited).toBe(true)
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
      end: '2026-12-04', items: ['Turn the HVAC back on', 'Turn the recirc pump back on'],
    })
    data = toggleChecked(data, 'T', `t:${idOf(data, 'Turn the HVAC back on')}`)
    expect(comingHomeSnapshot(data).trips[0].items).toEqual(['Turn the recirc pump back on'])
  })
})

describe('plannedReminders', () => {
  it('schedules an 8am last-day reminder with unchecked Coming Home items', () => {
    const plan = plannedReminders(setup(), new Date(2026, 10, 20))
    expect(plan).toHaveLength(1)
    expect(plan[0].at).toEqual(new Date(2026, 11, 4, 8))
    expect(plan[0].body).toBe('Turn the HVAC back on\nTurn the recirc pump back on')
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

  it('replaces an old saved starting list until the master list is edited', () => {
    const old = { ...setup(), templates: [{ id: 'seed1', category: 'pack', text: 'Wallet & keys', when: [] }] }
    expect(refreshStarterList(old).templates.map((t) => t.text)).not.toContain('Wallet & keys')
    expect(refreshStarterList(old).trips).toEqual(old.trips)
    const edited = { ...old, masterEdited: true }
    expect(refreshStarterList(edited)).toBe(edited)
  })
})
