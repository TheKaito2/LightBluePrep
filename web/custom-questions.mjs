/**
 * Your own questions (TikTok, a tutor's sheet, a worksheet), for practice on
 * localhost only. They live in ../custom/ (gitignored), one JSON file each, and
 * reach the app only through the dev server (vite.config.ts, apply: 'serve').
 * A production build never sees this file, the route or the questions: they
 * are not ours to publish. Format and steps: docs/CUSTOM-QUESTIONS.md.
 *
 *   node custom-questions.mjs check      validate every file, exit 1 on errors
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CUSTOM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../custom')

/** Skill code -> [section, domain, domain name, skill name], College Board's own. */
const SKILLS = {
  CID: ['RW', 'INI', 'Information and Ideas', 'Central Ideas and Details'],
  COE: ['RW', 'INI', 'Information and Ideas', 'Command of Evidence'],
  INF: ['RW', 'INI', 'Information and Ideas', 'Inferences'],
  WIC: ['RW', 'CAS', 'Craft and Structure', 'Words in Context'],
  TSP: ['RW', 'CAS', 'Craft and Structure', 'Text Structure and Purpose'],
  CTC: ['RW', 'CAS', 'Craft and Structure', 'Cross-Text Connections'],
  SYN: ['RW', 'EOI', 'Expression of Ideas', 'Rhetorical Synthesis'],
  TRA: ['RW', 'EOI', 'Expression of Ideas', 'Transitions'],
  BOU: ['RW', 'SEC', 'Standard English Conventions', 'Boundaries'],
  FSS: ['RW', 'SEC', 'Standard English Conventions', 'Form, Structure, and Sense'],
  'H.A.': ['MATH', 'H', 'Algebra', 'Linear equations in one variable'],
  'H.B.': ['MATH', 'H', 'Algebra', 'Linear functions'],
  'H.C.': ['MATH', 'H', 'Algebra', 'Linear equations in two variables'],
  'H.D.': ['MATH', 'H', 'Algebra', 'Systems of two linear equations in two variables'],
  'H.E.': ['MATH', 'H', 'Algebra', 'Linear inequalities in one or two variables'],
  'P.A.': ['MATH', 'P', 'Advanced Math', 'Equivalent expressions'],
  'P.B.': ['MATH', 'P', 'Advanced Math', 'Nonlinear equations in one variable and systems of equations in two variables'],
  'P.C.': ['MATH', 'P', 'Advanced Math', 'Nonlinear functions'],
  'Q.A.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Ratios, rates, proportional relationships, and units'],
  'Q.B.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Percentages'],
  'Q.C.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'One-variable data: Distributions and measures of center and spread'],
  'Q.D.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Two-variable data: Models and scatterplots'],
  'Q.E.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Probability and conditional probability'],
  'Q.F.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Inference from sample statistics and margin of error'],
  'Q.G.': ['MATH', 'Q', 'Problem-Solving and Data Analysis', 'Evaluating statistical claims: Observational studies and experiments'],
  'S.A.': ['MATH', 'S', 'Geometry and Trigonometry', 'Area and volume'],
  'S.B.': ['MATH', 'S', 'Geometry and Trigonometry', 'Lines, angles, and triangles'],
  'S.C.': ['MATH', 'S', 'Geometry and Trigonometry', 'Right triangles and trigonometry'],
  'S.D.': ['MATH', 'S', 'Geometry and Trigonometry', 'Circles'],
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

/** Every images/… reference turned into a data: image, which is all the app's sanitizer lets through. */
function inlineImages(html, dir, problems) {
  return String(html ?? '').replace(/src="images\/([^"]+)"/g, (_, name) => {
    const file = join(dir, 'images', name)
    const mime = MIME[extname(name).toLowerCase()]
    if (!mime || !existsSync(file)) { problems.push(`image images/${name} not found or not an image`); return 'src=""' }
    return `src="data:${mime};base64,${readFileSync(file).toString('base64')}"`
  })
}

/** One file to the stub and stored question the app uses, or the reasons it can't be. */
function build(id, raw, dir, addedFallback) {
  const problems = []
  const skill = SKILLS[raw.skill]
  if (!skill) problems.push(`unknown skill "${raw.skill}" (use a code like H.A. or CID)`)
  if (skill && raw.section && raw.section !== skill[0]) problems.push(`section ${raw.section} does not match skill ${raw.skill}`)
  if (!['E', 'M', 'H'].includes(raw.difficulty)) problems.push('difficulty must be E, M or H')
  if (!String(raw.stem ?? '').trim()) problems.push('stem is empty')
  const type = raw.type === 'spr' ? 'spr' : raw.type === 'mcq' ? 'mcq' : null
  if (!type) problems.push('type must be "mcq" or "spr"')
  let correct = []
  let options = null
  if (type === 'mcq') {
    const choices = Array.isArray(raw.choices) ? raw.choices : []
    if (choices.length < 2 || choices.length > 5) problems.push('a choice question needs 2 to 5 choices')
    options = choices.map((html, i) => ({ label: String.fromCharCode(65 + i), html: inlineImages(html, dir, problems) }))
    const key = String(raw.answer ?? '').trim().toUpperCase()
    if (!options.some((o) => o.label === key)) problems.push(`answer "${raw.answer}" is not one of the choice letters`)
    correct = [key]
  } else if (type === 'spr') {
    correct = (Array.isArray(raw.answer) ? raw.answer : [raw.answer]).map((a) => String(a ?? '').trim()).filter(Boolean)
    if (!correct.length) problems.push('a grid-in needs at least one accepted answer')
  }
  if (problems.length) return { problems }

  const [section, domain, domainName, skillName] = skill
  const source = String(raw.source ?? '').trim()
  const explanation = inlineImages(raw.explanation, dir, problems)
    + (source ? `<p><em>Source: ${source.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</em></p>` : '')
  const explanations = raw.explanations && type === 'mcq'
    ? Object.fromEntries(Object.entries(raw.explanations).map(([k, v]) => [k.toUpperCase(), inlineImages(v, dir, problems)]))
    : null
  const added = Date.parse(raw.added ?? '') || addedFallback
  const qid = `custom-${id}`
  return {
    problems,
    stub: {
      _id: qid, _path: 'custom', _section: section, questionId: `my-${id}`, updateDate: added,
      primary_class_cd: domain, primary_class_cd_desc: domainName, skill_cd: raw.skill, skill_desc: skillName,
      difficulty: raw.difficulty, score_band_range_cd: null,
    },
    question: {
      id: qid, source_path: 'custom', cb_id: `my-${id}`, section, domain, domain_name: domainName,
      skill: raw.skill, skill_name: skillName, difficulty: raw.difficulty, band: null, type,
      stimulus_html: inlineImages(raw.passage, dir, problems), stem_html: inlineImages(raw.stem, dir, problems),
      options, correct, rationale_html: explanation, explanations, key_recovered: false, flags: [],
    },
  }
}

/** Every valid question in `dir`, and a line per problem in the rest. A missing folder is no questions. */
export function loadCustom(dir = CUSTOM_DIR) {
  const folder = join(dir, 'questions')
  if (!existsSync(folder)) return { questions: [], errors: [] }
  const questions = []
  const errors = []
  for (const name of readdirSync(folder).filter((n) => n.endsWith('.json')).sort()) {
    const id = name.slice(0, -5).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    try {
      const raw = JSON.parse(readFileSync(join(folder, name), 'utf8'))
      const { problems, stub, question } = build(id, raw, dir, 0)
      if (problems.length) errors.push(`${name}: ${problems.join('; ')}`)
      else questions.push({ stub, question })
    } catch (e) {
      errors.push(`${name}: not valid JSON (${e.message})`)
    }
  }
  return { questions, errors }
}

/** Vite plugin: the questions at /__custom/questions.json, read fresh each time, dev server only. */
export function customQuestions(dir = CUSTOM_DIR) {
  return {
    name: 'custom-questions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__custom/questions.json', (_req, res) => {
        const { questions, errors } = loadCustom(dir)
        for (const e of errors) server.config.logger.warn(`[custom questions] ${e}`)
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(questions))
      })
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === 'check') {
  const { questions, errors } = loadCustom(process.argv[3] ? resolve(process.argv[3]) : CUSTOM_DIR)
  console.log(`${questions.length} question${questions.length === 1 ? '' : 's'} ok in ${process.argv[3] ?? CUSTOM_DIR}`)
  for (const q of questions) console.log(`  ${q.question.cb_id}  ${q.question.skill} ${q.question.type}`)
  for (const e of errors) console.error(`  ERROR ${e}`)
  process.exitCode = errors.length ? 1 : 0
}
