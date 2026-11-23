import { describe, expect, it } from 'vitest'
import { DATA_VERSION, defaultData } from './model'
import { DataError, parseData } from './parseData'

const trip = {
  id: 'T', name: 'Tahoe', start: '2026-12-01', end: '2026-12-04',
  answers: { max: true }, checked: { 't:s-socks': true }, hidden: {}, extras: [],
  headingHome: false, ended: false,
}
const current = () => ({ ...defaultData(), trips: [structuredClone(trip)] })
// A version 1 document, as builds before the starter list was retired saved it.
const v1 = (patch = {}) => ({ ...current(), version: 1, masterEdited: true, starterRevision: 3, ...patch })
const errorOf = (fn) => { try { fn() } catch (e) { return e } return null }

describe('parseData', () => {
  it('passes current data through unchanged', () => {
    expect(parseData(current())).toEqual(current())
  })

  it('fills fields older data omits', () => {
    const old = v1()
    old.questions = old.questions.map(({ short, askIf, ...q }) => (q.id === 'swim' ? { ...q, askIf: 'fly' } : q))
    old.templates = old.templates.map(({ group, perDay, requires, ...item }) => item)
    old.trips = old.trips.map(({ headingHome, ended, ...t }) => t)
    const data = parseData(old)
    expect(data.questions[0]).toMatchObject({ short: 'Bringing Max?', askIf: [] })
    expect(data.questions.find((q) => q.id === 'swim').askIf).toEqual(['fly'])
    expect(data.templates.find((t) => t.category === 'pack')).toMatchObject({ group: 'Main', perDay: false, requires: null })
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

  it('leaves the lists themselves alone', () => {
    const old = v1({ masterEdited: false, templates: current().templates.slice(0, 3) })
    expect(parseData(old).templates).toEqual(old.templates)
  })
})
