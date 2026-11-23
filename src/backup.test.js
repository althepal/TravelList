import { describe, expect, it } from 'vitest'
import { backupValidationError, normalizeBackup } from './backup'
import { defaultData } from './model'

describe('backup imports', () => {
  it('fills fields omitted by older backups', () => {
    const backup = structuredClone(defaultData())
    backup.questions = backup.questions.map(({ short, ...question }) => question)
    backup.templates = backup.templates.map(({ group, perDay, ...item }) => item)

    expect(backupValidationError(backup)).toBeNull()
    const normalized = normalizeBackup(backup)
    expect(normalized.masterEdited).toBe(true)
    expect(normalized.questions[0].short).toBe(normalized.questions[0].text)
    expect(normalized.templates.find((item) => item.category === 'pack')).toMatchObject({ group: 'Main', perDay: false })
    expect(normalized.templates.find((item) => item.category === 'door')).toMatchObject({ group: null, perDay: false })
  })

  it('keeps valid Pack options and resets invalid values to safe defaults', () => {
    const backup = structuredClone(defaultData())
    backup.templates[0] = { ...backup.templates[0], group: 'Max', perDay: true }
    backup.templates[1] = { ...backup.templates[1], group: 'Unknown', perDay: 'yes' }

    expect(normalizeBackup(backup).templates.slice(0, 2)).toMatchObject([
      { group: 'Max', perDay: true },
      { group: 'Main', perDay: false },
    ])
  })

  it('rejects malformed trip dates before normalization', () => {
    const backup = structuredClone(defaultData())
    backup.trips.push({
      id: 't1', name: 'Broken', start: '2026-02-30', end: '2026-03-01',
      answers: {}, checked: {}, hidden: {}, extras: [],
    })
    expect(backupValidationError(backup)).toContain('invalid trip')
  })
})
