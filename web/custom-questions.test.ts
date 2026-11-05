/**
 * Your own questions (custom-questions.mjs): the loader takes a good file,
 * reports a bad one by name, inlines its images, and the plugin exists on the
 * dev server only, so no build can carry the questions.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { customQuestions, loadCustom } from './custom-questions.mjs'

function folder(files: Record<string, unknown>, images: Record<string, Buffer> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'custom-'))
  mkdirSync(join(dir, 'questions'))
  mkdirSync(join(dir, 'images'))
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, 'questions', name), typeof body === 'string' ? body : JSON.stringify(body))
  }
  for (const [name, bytes] of Object.entries(images)) writeFileSync(join(dir, 'images', name), bytes)
  return dir
}

const good = {
  source: 'A <tutor>', section: 'MATH', skill: 'H.A.', difficulty: 'E', type: 'mcq',
  stem: '<p>Pick B.</p><img src="images/a.png">', choices: ['<p>1</p>', '<p>2</p>'], answer: 'b',
  explanation: '<p>Because.</p>',
}

describe('custom questions', () => {
  it('turns a good file into a stub and a question the app can practise', () => {
    const { questions, errors } = loadCustom(folder({ 'One Two.json': good }, { 'a.png': Buffer.from('png') }))
    expect(errors).toEqual([])
    const { stub, question } = questions[0]!
    expect(stub).toMatchObject({ _id: 'custom-one-two', _path: 'custom', _section: 'MATH', questionId: 'my-one-two', primary_class_cd: 'H' })
    expect(question).toMatchObject({ id: 'custom-one-two', type: 'mcq', correct: ['B'], skill: 'H.A.' })
    expect(question.stem_html).toContain('src="data:image/png;base64,')
    expect(question.rationale_html).toContain('Source: A &lt;tutor>')
  })

  it('reports each bad file by name, and keeps the good ones', () => {
    const { questions, errors } = loadCustom(folder({
      'ok.json': good,
      'bad.json': { ...good, skill: 'XYZ', answer: 'Q' },
      'grid.json': { ...good, type: 'spr', answer: [], choices: undefined },
      'broken.json': '{ not json',
    }, { 'a.png': Buffer.from('png') }))
    expect(questions.map((q) => q.stub.questionId)).toEqual(['my-ok'])
    expect(errors.join('\n')).toMatch(/bad\.json: unknown skill/)
    expect(errors.join('\n')).toMatch(/grid\.json: a grid-in needs/)
    expect(errors.join('\n')).toMatch(/broken\.json: not valid JSON/)
  })

  it('flags a missing image, and a missing folder is no questions', () => {
    expect(loadCustom(folder({ 'x.json': good })).errors[0]).toMatch(/images\/a\.png not found/)
    expect(loadCustom(join(tmpdir(), 'no-such-folder-here'))).toEqual({ questions: [], errors: [] })
  })

  it('runs on the dev server only', () => {
    expect(customQuestions().apply).toBe('serve')
  })
})
