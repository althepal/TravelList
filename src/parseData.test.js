import { describe, expect, it } from 'vitest'
import { DATA_VERSION, defaultData, NEVER_CONDITION, tripItems } from './model'
import { DataError, parseData } from './parseData'

const trip = {
  id: 'T', name: 'Tahoe', start: '2026-12-01', end: '2026-12-04',
  answers: { max: true }, checked: { 't:s-socks': true }, hidden: {}, extras: [],
  headingHome: false, ended: false,
}
const current = () => ({ ...defaultData(), trips: [structuredClone(trip)] })
const legacyItem = (patch = {}) => ({
  id: 's-socks', category: 'pack', text: 'Socks', when: [], requires: null, group: 'Main', perDay: true, ...patch,
})
const v2 = (patch = {}) => ({ ...current(), version: 2, templates: [legacyItem()], ...patch })
// A version 1 document, as builds before the starter list was retired saved it.
const v1 = (patch = {}) => v2({ version: 1, masterEdited: true, starterRevision: 3, ...patch })
const errorOf = (fn) => { try { fn() } catch (e) { return e } return null }

describe('parseData', () => {
  it('passes current data through unchanged', () => {
    expect(parseData(current())).toEqual(current())
  })

  it('fills fields older data omits', () => {
    const old = v1({ templates: [legacyItem(), legacyItem({ id: 'close-door', category: 'door', text: 'Close door' })] })
    old.questions = old.questions.map(({ short, askIf, ...q }) => (q.id === 'swim' ? { ...q, askIf: 'fly' } : q))
    old.templates = old.templates.map(({ group, perDay, requires, ...item }) => item)
    old.trips = old.trips.map(({ headingHome, ended, ...t }) => t)
    const data = parseData(old)
    expect(data.questions[0]).toMatchObject({ short: 'Bringing Max?', askIf: [] })
    expect(data.questions.find((q) => q.id === 'swim').askIf).toEqual(['fly'])
    expect(data.templates.find((t) => t.category === 'pack')).toMatchObject({ group: 'Main', perDay: false, conditionGroups: [] })
    expect(data.templates.find((t) => t.category === 'door')).toMatchObject({ group: null, perDay: false })
    expect(data.trips[0]).toMatchObject({ headingHome: false, ended: false })
  })

  it('keeps valid Pack headings and resets unknown ones to Main', () => {
    const data = current()
    data.templates[0] = { ...data.templates[0], group: 'Max' }
    data.templates[1] = { ...data.templates[1], group: 'Unknown' }
    expect(parseData(data).templates.slice(0, 2)).toMatchObject([{ group: 'Max' }, { group: 'Main' }])
  })

  it('refuses data from a newer version, so this build never overwrites it', () => {
    const error = errorOf(() => parseData({ ...current(), version: DATA_VERSION + 1 }))
    expect(error).toBeInstanceOf(DataError)
    expect(error.code).toBe('newer')
  })

  it('rejects damaged data with a readable reason', () => {
    expect(errorOf(() => parseData(null)).message).toMatch(/isn't TravelList data/)
    expect(errorOf(() => parseData({ version: 2 })).message).toMatch(/missing/)
    const badDate = current()
    badDate.trips[0].start = '2026-02-30'
    expect(errorOf(() => parseData(badDate)).message).toMatch(/invalid trip/)
  })

  it('drops empty groups from saved lists and imported backups alike', () => {
    const saved = current()
    saved.templates[0].conditionGroups = [{ all: [] }]
    saved.templates[1].conditionGroups = [{ all: [] }, { all: ['max'] }]
    expect(parseData(saved, { imported: true })).toEqual(parseData(saved))

    const recovered = parseData(saved)
    expect(recovered.templates.slice(0, 2).map(({ conditionGroups }) => conditionGroups)).toEqual([
      [{ all: [NEVER_CONDITION.id] }], [{ all: ['max'] }],
    ])
    const included = tripItems(recovered, recovered.trips[0]).map(({ text }) => text)
    expect(included).not.toContain('Underwear')
    expect(included).toContain('Socks')
    expect(parseData(recovered, { imported: true })).toEqual(recovered)
  })

  it("accepts what the app copes with in the list in use, but not in a backup being imported", () => {
    const loop = current()
    loop.questions = [{ id: 'a', text: 'A?', askIf: ['b'] }, { id: 'b', text: 'B?', askIf: ['a'] }]
    expect(parseData(loop).questions).toHaveLength(2)
    expect(errorOf(() => parseData(loop, { imported: true })).message).toMatch(/loop/)
    const duplicate = current()
    duplicate.trips.push(structuredClone(trip))
    expect(parseData(duplicate).trips).toHaveLength(2)
    expect(errorOf(() => parseData(duplicate, { imported: true })).message).toMatch(/same ID/)
  })
})

describe('upgrade from version 1', () => {
  it('drops the starter-list bookkeeping', () => {
    const data = parseData(v1())
    expect(data.version).toBe(DATA_VERSION)
    expect(data).not.toHaveProperty('masterEdited')
    expect(data).not.toHaveProperty('starterRevision')
  })

  it('keeps item IDs, labels, and trip check marks through both upgrades', () => {
    const data = parseData(v1({ masterEdited: false }))
    expect(data.templates[0]).toMatchObject({ id: 's-socks', text: 'Socks', conditionGroups: [] })
    expect(data.trips).toEqual([trip])
  })
})

describe('upgrade from version 3', () => {
  const v3 = (questions) => ({ ...current(), version: 3, questions })
  const withoutRule = () => current().questions.map(({ autoYesIf, ...q }) => q)
  const swimOf = (data) => data.questions.find((q) => q.id === 'swim')

  it('turns the built-in Harrison rule into Swimming’s Auto yes rule', () => {
    const data = parseData(v3(withoutRule()))
    expect(swimOf(data).autoYesIf).toEqual(['harrison'])
    expect(data.questions.filter((q) => q.id !== 'swim').every((q) => q.autoYesIf.length === 0)).toBe(true)
  })

  it.each([[['camping']], [['camping', 'harrison']]])('preserves Swimming’s existing Auto yes rules (%j)', (autoYesIf) => {
    const questions = withoutRule().map((q) => q.id === 'swim' ? { ...q, autoYesIf } : q)
    expect(swimOf(parseData(v3(questions))).autoYesIf).toEqual(['camping', 'harrison'])
  })

  it('keeps the rule removed once the list is upgraded', () => {
    const data = current()
    data.questions = data.questions.map((q) => ({ ...q, autoYesIf: [] }))
    expect(swimOf(parseData(data)).autoYesIf).toEqual([])
  })

  it('skips the rule when Harrison was set to depend on Swimming', () => {
    const questions = withoutRule().map((q) => (q.id === 'harrison' ? { ...q, askIf: ['swim'] } : q))
    expect(swimOf(parseData(v3(questions), { imported: true })).autoYesIf).toEqual([])
  })

  it('keeps version 2’s explicit Harrison alternatives when the rule would loop', () => {
    const questions = withoutRule().map((q) => (q.id === 'harrison' ? { ...q, askIf: ['swim', 'fly'] } : q))
    const old = v2({ questions, templates: [
      legacyItem({ id: 'suit', text: "Max's bathing suit", when: ['swim', 'harrison'], requires: 'max' }),
    ] })
    const data = parseData(old, { imported: true })
    expect(swimOf(data).autoYesIf).toEqual([])
    expect(data.templates[0].conditionGroups).toEqual([{ all: ['max', 'swim'] }, { all: ['max', 'harrison'] }])
  })

  it('keeps version 2’s Harrison alternatives when the list has no Swimming question', () => {
    const old = v2({
      questions: withoutRule().filter((q) => q.id !== 'swim'),
      templates: [legacyItem({ id: 'suit', when: ['swim', 'harrison'] })],
    })
    expect(parseData(old).templates[0].conditionGroups).toEqual([{ all: ['swim'] }, { all: ['harrison'] }])
  })

  it('skips the rule when the list has no Harrison question', () => {
    expect(swimOf(parseData(v3(withoutRule().filter((q) => q.id !== 'harrison')))).autoYesIf).toEqual([])
  })
})

it('refuses an imported backup whose Auto yes rules loop', () => {
  const loop = current()
  loop.questions = loop.questions.map((q) => (q.id === 'harrison' ? { ...q, askIf: ['swim'] } : q))
  expect(parseData(loop).questions).toHaveLength(5)
  expect(errorOf(() => parseData(loop, { imported: true })).message).toMatch(/loop/)
})

it('upgrades existing rules and reuses the swimming default at Harrison', () => {
  const data = parseData(v2({ templates: [
    legacyItem({ id: 'a', requires: 'max' }),
    legacyItem({ id: 'b', when: ['camping', 'fly'] }),
    legacyItem({ id: 'c', when: ['camping', 'fly'], requires: 'max' }),
    legacyItem({ id: 'd', when: ['swim', 'harrison'], requires: 'max' }),
    legacyItem({ id: 'e', when: ['max', 'fly'], requires: 'max' }),
  ] }), { imported: true })
  expect(data.templates.map(({ conditionGroups }) => conditionGroups)).toEqual([
    [{ all: ['max'] }],
    [{ all: ['camping'] }, { all: ['fly'] }],
    [{ all: ['max', 'camping'] }, { all: ['max', 'fly'] }],
    [{ all: ['max', 'swim'] }],
    [{ all: ['max'] }],
  ])
})
