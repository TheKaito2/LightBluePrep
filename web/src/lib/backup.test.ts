import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT, BACKUP_VERSION, BackupError, backupBlob, metaToWrite, newAttempts, newerRows,
  parseBackup, type Backup,
} from './backup'
import type { Attempt, MarkRecord, SetRecord } from './store'

const attempt = (id: string, question_id = 'q1'): Attempt =>
  ({ id, question_id, answered_at: 1_760_000_000, response: 'A', correct: 1, seconds: 42 })
const mark = (question_id: string, flagged: number, updated_at: number): MarkRecord =>
  ({ question_id, flagged, updated_at })
const set: SetRecord = {
  id: 's1', created_at: 1, finished_at: null, updated_at: 5, seconds: 30,
  filters: { section: 'MATH' }, items: [{ question_id: 'q1', response: null, correct: 0, seconds: 0 }],
}

const sample: Backup = {
  format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: 1_760_000_000_000,
  attempts: [attempt('a1'), attempt('a2', 'q2')],
  marks: [mark('q1', 1, 10)],
  annotations: [{ question_id: 'q1', updated_at: 11, items: [
    { id: 1, field: 'stem', start_offset: 0, end_offset: 4, color: 'yellow', note: 'look here' },
  ] }],
  mistakes: [{ question_id: 'q2', tags: ['silly'], note: null, updated_at: 12 }],
  sets: [set],
  meta: { goal: { date: '2026-12-05', target: 1350, daily: 10, updated_at: 3 } },
}

describe('backup file', () => {
  it('round trips through the file it downloads', async () => {
    const text = await backupBlob(sample).text()
    expect(parseBackup(text)).toEqual(sample)
  })

  it('keeps only the student\'s own meta keys', () => {
    const text = JSON.stringify({ ...sample, meta: { ...sample.meta, 'sync.cursor': 99, 'usage.sent': [1] } })
    expect(Object.keys(parseBackup(text).meta)).toEqual(['goal'])
  })

  it('refuses files that are not a backup, damaged, or from a newer version', () => {
    for (const bad of [
      'not json',
      '{"hello":1}',
      JSON.stringify({ ...sample, version: BACKUP_VERSION + 1 }),
      JSON.stringify({ ...sample, attempts: [{ id: 'a1' }] }),
      JSON.stringify({ ...sample, marks: 'nope' }),
      JSON.stringify({ ...sample, sets: [{ ...set, items: [{}] }] }),
    ]) {
      expect(() => parseBackup(bad)).toThrow(BackupError)
    }
  })
})

describe('restore merge', () => {
  it('adds only attempts this device lacks', () => {
    expect(newAttempts([attempt('a1')], sample.attempts).map((a) => a.id)).toEqual(['a2'])
  })

  it('keeps the newer row on either side, and skips ties', () => {
    const mine = [mark('q1', 0, 20), mark('q2', 1, 5), mark('q3', 1, 7)]
    const theirs = [mark('q1', 1, 10), mark('q2', 0, 9), mark('q3', 1, 7), mark('q4', 1, 1)]
    const write = newerRows(mine, theirs, (r) => r.question_id)
    // q1: mine is newer and stays. q2: the file is newer. q3: the same edit. q4: new.
    expect(write.map((r) => r.question_id)).toEqual(['q2', 'q4'])
  })

  it('fills meta gaps and lets a newer goal win', () => {
    const older = { goal: { target: 1200, updated_at: 1 } }
    const newer = { goal: { target: 1400, updated_at: 2 } }
    expect(metaToWrite({}, newer)).toEqual(newer)
    expect(metaToWrite(older, newer)).toEqual(newer)
    expect(metaToWrite(newer, older)).toEqual({})
    // Untimestamped flags only fill a gap.
    expect(metaToWrite({ 'coach-tip-shown': true }, { 'coach-tip-shown': false })).toEqual({})
    expect(metaToWrite({}, { 'coach-tip-shown': true })).toEqual({ 'coach-tip-shown': true })
  })
})
