# Your own questions (localhost only)

Questions from anywhere else (a TikTok, a tutor's sheet, a worksheet) can be
practiced in the app on your own machine. They are never committed, never in a
build, and never on the live site: `custom/` is gitignored, and only the Vite
dev server (`web/custom-questions.mjs`, `apply: 'serve'`) hands them to the app.

## Run it

```
cd web
npm run custom
```

Open http://localhost:5174. Home shows a **My questions** card (unanswered
first). Each question also sits under its skill with the official ones, and
the ID search finds it as `my-<file name>`. Progress here is stored in this
browser for localhost, apart from the live site, and does not sync.

## Add one

One JSON file per question in `custom/questions/`, named after it
(`linear-tiktok-01.json` becomes `my-linear-tiktok-01`). Figures go in
`custom/images/` and are referenced as `images/<file>`.

```json
{
  "source": "TikTok @someone, 2026-11-05",
  "section": "MATH",
  "skill": "H.A.",
  "difficulty": "M",
  "type": "mcq",
  "passage": "<p>Optional text or table above the question.</p>",
  "stem": "<p>If <math><mn>3</mn><mi>x</mi><mo>+</mo><mn>5</mn><mo>=</mo><mn>20</mn></math>, what is x?</p>",
  "choices": ["<p>3</p>", "<p>5</p>", "<p>15</p>", "<p>25</p>"],
  "answer": "B",
  "explanations": { "A": "<p>Why A is wrong.</p>", "B": "<p>Why B is right.</p>" },
  "explanation": "<p>The full working.</p>",
  "added": "2026-11-05"
}
```

- `type`: `mcq` (2 to 5 `choices`, `answer` is a letter) or `spr` (no choices,
  `answer` is a list of accepted answers such as `["3/2", "1.5"]`; equivalent
  forms and Bluebook's fill-the-box rounding are accepted anyway).
- `skill`: a College Board skill code. Reading and Writing: CID COE INF WIC TSP
  CTC SYN TRA BOU FSS. Math: H.A.–H.E., P.A.–P.C., Q.A.–Q.G., S.A.–S.D.
  `section` is optional and must match the skill.
- `difficulty`: E, M or H.
- Maths in MathML (rendered by MathJax). Images: `<img src="images/x.png" alt="…">`.
- `explanations` per choice are optional; `explanation` shows as the full one,
  with `source` added under it.

Check before practicing:

```
node web/custom-questions.mjs check
```

It lists every question that loads and names each file that doesn't, with the
reason. The dev server also logs those reasons. Refresh the page to pick up a
new or edited file.
