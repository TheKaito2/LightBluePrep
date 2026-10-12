# LightBluePrep

**Every official College Board SAT practice question, free, in a question bank you can filter, track and re-drill.**

Live: **https://lightblueprep.pages.dev**

![LightBluePrep](web/public/og-card.png)

## What it does

- **Topics first.** Tick domains and skills on Home, each with your coverage and accuracy, and narrow any skill to one or more **question types**: 180 solving-process types across the 29 skills ("Find the constant for no or infinite solutions", "Join two complete sentences").
- **Options.** Skip what you've done, drill only what you got wrong or marked, Mixed / By topic / Random order, and timed **practice sets** of 10 to 50 that grade at the end like Bluebook.
- **Review.** Everything you've answered, with filters for Incorrect, Marked and Has a note (by mistake type), a **Redo** for any pile or section, and **Practice similar** under each question.
- **College Board question IDs** behind the Info button, with one-click copy and a YouTube search for walkthroughs of that exact question. Search any ID from Home.
- **Bluebook-style practice screen**: split passage view, built-in Desmos, a math reference sheet, highlights and notes, cross-out, mark for review, the official explanation for every answer choice, and a mistake log after a wrong answer.
- **Progress**: streaks, an estimated score per section, and stats by skill.
- **Free, no account, no ads, no tracking.** Questions are fetched by your browser straight from College Board; this project never hosts them. Optional Google sign-in syncs progress between devices. Visits are counted anonymously, with no cookies and no IDs.

## Credits and license

Third-party components (React, MathJax, Bricolage Grotesque and Noto fonts) and their licenses are listed in [web/public/third-party-licenses.txt](web/public/third-party-licenses.txt), which the site also serves at `/third-party-licenses.txt`.

LightBluePrep is a modified version of [Bluebank](https://github.com/jackwangxyw/Bluebank) by jackwangxyw, licensed under the GNU General Public License v3. LightBluePrep is distributed under the same license; see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for what was changed and when.

Not affiliated with or endorsed by College Board. SAT and Bluebook are trademarks of College Board. This is a free, non-commercial student project.

## Deploying (Cloudflare Pages)

```
cd web
npm run build:pages
npx wrangler pages deploy dist-pages --project-name lightblueprep --branch main
```

Config lives in `web/.env.pages`: `VITE_DONATE_URL` shows the Support link; `VITE_SYNC_API` and `VITE_GOOGLE_CLIENT_ID` turn on sign-in and sync (blank = off); `VITE_CF_BEACON` is the Cloudflare Web Analytics token (blank = no beacon; a fork should blank it or use its own). The security headers are in `web/public/_headers`, which only Cloudflare Pages applies.

### Usage counts

Two anonymous counts, both in [web/src/lib/usage.ts](web/src/lib/usage.ts) and both described in the privacy policy. Cloudflare Web Analytics (dashboard, Web Analytics) has page views and where visitors came from, but counts visits, not people. For people, each browser tells the sync Worker once when it answers its first question and once at its tenth different question, with no ID; the Worker keeps a total per day:

```
cd worker
npx wrangler d1 execute lightblueprep --remote --command "SELECT step, SUM(n) AS browsers FROM milestones GROUP BY step"
```

`step` 1 is browsers that tried it, 10 is browsers that used it. One person on two devices counts twice. Anyone can POST to the endpoint, so check the totals against Web Analytics visits.

The sync Worker deploys separately with `cd worker && npx wrangler deploy`. When a change adds a file under `worker/migrations/`, run it on the database first, then deploy the Worker:

```
cd worker
npx wrangler d1 execute lightblueprep --remote --file=migrations/<file>.sql
npx wrangler deploy
```

## Technical documentation

The sections below come from the upstream Bluebank README and still describe how the code works. The Python package and CLI keep the name `bluebank`.

### Quick Start for Self Hosting
Everything from here down is for running your own copy. If you just want to use the site, you're done.

You need Python 3.9 or newer and Node. Only the localhost backend needs this build, since the static one downloads nothing until you open it.

```
python -m bluebank build     # index, fetch, normalize
cd web && npm install && npm run build
cd .. && python -m bluebank serve
```

Then open http://localhost:8000. Give it about five minutes, almost all of it pass 2 pulling 3,767 question bodies at 12.8 requests a second. If you only want to poke at the data, `build` on its own is enough and you can skip the web part.

For frontend work, run `python -m bluebank serve` in one terminal and `npm run dev` in another. Vite sits on 5173 and proxies `/api` to 8000, so you get hot reload against the real data.

### Two Backends
The frontend talks to one module, [web/src/api.ts](web/src/api.ts), and nothing else in the app touches the network or storage. That module picks between two implementations at build time.

| | localhost | static build |
| :--- | :--- | :--- |
| Questions | Python server and SQLite | College Board direct, cached in IndexedDB |
| Up front | the whole bank, about five minutes | the index only, 1.7 seconds |
| Grading | server | browser |
| Answer key | withheld until you answer | necessarily in the browser |
| Progress | `data/bluebank.db` | IndexedDB, optionally synced |

```
npm run build         # -> dist/        localhost
npm run build:pages   # -> dist-pages/  static, no server
```

`?backend=local` or `?backend=http` overrides the choice for one page load, which is handy for testing the static path against the dev server without a separate build.

The two don't share progress. Answering on one doesn't show up on the other, and only the static build can sync.

The static build depends on College Board sending `Access-Control-Allow-Origin: *`, which they currently do on all four endpoints. That header is theirs to change, and if they tighten it the static build stops working in a browser while the Python one keeps going, since a server ignores CORS.

### Commands
| Command | What it does |
| :--- | :--- |
| `index` | Pass 1, builds `data/index.json` from two API calls, plus `data/live.json` |
| `fetch` | Pass 2, downloads question bodies into `raw/`, resumable |
| `normalize` | Pass 3, parses everything into SQLite |
| `build` | All three |
| `serve` | API plus the built frontend on :8000 |
| `stats` | Counts by section, domain and type |
| `show <id>` | Prints one question |
| `answer <id> <response>` | Grades from the command line |
| `audit` | Lists flagged questions, should be exactly 3 |
| `import <file.json>` | Loads questions from a file instead of the API |

`fetch` skips anything already in `raw/` with a matching `updateDate`, so re-running it after an interruption picks up where it stopped. `--force` on any of the first four ignores that and refetches everything. `--strict` makes them exit nonzero when something gets flagged, which is what you'd want if you ever ran this on a schedule. `serve` takes `--host 0.0.0.0` to reach it from your phone on the same network.

### Where the Data Lives
Four tables in [data/bluebank.db](data) are yours: `attempts`, `annotations`, `marks` and `mistakes`. Everything else re-downloads. That's a couple of KB of real data sitting inside a 47 MB file, so back up the tables rather than the database.

```
python -c "
import sqlite3, json, io
c = sqlite3.connect('data/bluebank.db'); c.row_factory = sqlite3.Row
out = {t: [dict(r) for r in c.execute('select * from %s' % t)] for t in ('attempts','annotations','marks','mistakes')}
io.open('progress-backup.json','w',encoding='utf-8').write(json.dumps(out, indent=1))"
```

To wipe your progress and keep the questions, delete from those same four tables. To wipe everything, `rm -rf data raw` and run `build` again.

On the static build it's IndexedDB under database `bluebank`, and `indexedDB.deleteDatabase('bluebank')` in the console clears it. The app calls `navigator.storage.persist()` on startup so the browser won't evict the cache under storage pressure. If you've signed in, clearing that only clears this device, and the delete button in the sync panel is what removes the copy on the server.

The cached index is re-read after a week, in the background so it never costs you a cold start. Without that it was fetched once on your first visit and never again, so new questions added to the bank would never show up on that device.

### Deploying the Static Build
Deploy `dist-pages/` with `wrangler pages deploy` as above. [.github/workflows/ci.yml](.github/workflows/ci.yml) only runs both test suites and a build on every push; it deploys nothing. (Upstream's workflow published to GitHub Pages, which ignores `_headers`, so it would have served a copy with no CSP.) GitHub doesn't run workflows on a fork until you enable them on its Actions tab.

The build is served from the root. To serve it from a sub-path instead, for example `username.github.io/repo`, build with `BASE=/repo/ npm run build:pages`.

### Running Your Own Sync Server
Skip this unless you want sync on your own deployment. Leave `VITE_SYNC_API` and `VITE_GOOGLE_CLIENT_ID` blank in [web/.env.pages](web/.env.pages) and the account UI doesn't render at all, which is also the rollback.

The server is one Cloudflare Worker over a D1 database, in [worker/](worker). Create a D1 database and paste [worker/schema.sql](worker/schema.sql) into its Console. Create a worker and paste in [worker/src/index.js](worker/src/index.js). Under Settings, Bindings, add a D1 binding named exactly `DB`. Under Settings, Variables and Secrets, add `GOOGLE_CLIENT_ID` as a secret. Then put the worker URL and that same client id into `.env.pages`.

**Edit `ALLOWED_ORIGINS` at the top of `index.js` before you deploy it.** It's a hardcoded list that ships with my origin in it, so until yours is in there every request from your site comes back 403 and nothing about the failure points at this. Scheme and host only, no trailing slash and no path.

The client id has to come from a Web application OAuth client in the Google Cloud Console, with that same origin listed under Authorized JavaScript origins. Google's list, `ALLOWED_ORIGINS` and `.env.pages` all have to agree, and one of them disagreeing is the usual reason sign-in fails. `GET /health` reports which bindings actually landed and which client id the worker thinks it has, so check that first. Saving a binding in the dashboard without hitting Deploy leaves it missing at runtime and nothing else tells you.

`ALLOWED_SUBS` is optional. Unset, anyone with a Google account can sign in and gets their own private row. Set to a comma separated list of Google subs, it locks the deployment to those accounts. `ADMIN_SUBS` lists the subs that can read the feedback inbox. To find your own sub, sign in once and run `SELECT sub, created_at FROM users` in the D1 console; nothing is logged.

The Worker rate-limits sign-in, feedback and the usage count per IP and sync per account (the `ratelimits` in [worker/wrangler.jsonc](worker/wrangler.jsonc); each is optional, so a dashboard paste with no bindings still runs), refuses oversized requests, validates every row it stores, caps sessions at ten per account, and keeps each account's row counts on its cursor row so the storage ceilings never need a `COUNT(*)` over the account.

Attempts merge by union on a uuid, so a sync that fails, runs twice, or arrives out of order can't lose or duplicate anything. Marks, annotations, the mistake log and sets are last write wins, decided on the server so a device with a wrong clock can't stomp newer data, and guarded on the device too, so a reply that lands mid-edit can't undo the edit. Deleting a set writes a tombstone that syncs like any other change. If you set this up before the mistake log or the `sets` table existed, re-run `schema.sql`, then run each file in `worker/migrations/` once, and re-paste the worker.

### The API
Four endpoints, no authentication of any kind. Confirmed with bare curl sending only `Content-Type`, and confirmed again from a real browser on a foreign origin.

```
POST https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions
     {"asmtEventId": 99, "test": 1, "domain": "INI,CAS,EOI,SEC"}   # 1 = RW, 2 = Math
POST .../questionbank/digital/get-question   {"external_id": "..."}
GET  https://saic.collegeboard.org/disclosed/{ibn}.json
GET  .../questionbank/lookup                 # no body, see below
```

Math domains are `H,P,Q,S`. Difficulty is E/M/H, but there's also `score_band_range_cd`, which runs 1 to 7 and is finer, so use that one if you ever build adaptive logic on top of this.

The whole index is those first two calls and takes 1.7 seconds. They return 3,770 stubs, three of which are the same question filed twice under different ids, so the pipeline keeps the newer of each pair and you end up with 3,767. The individual bodies are what take five minutes. A stub carries an `external_id` or an `ibn`, never both. The 459 `ibn` items are the older disclosed set, from a different host in a different shape, and they're the ones the parser has to work for.

`lookup` is the one that isn't obvious. It returns `readingLiveItems` and `mathLiveItems`, 1,110 and 927 external_ids, and those are the questions that also sit on an official full-length practice test. It's what College Board's own bank means by "Exclude Active Questions", and it's how the same filter works here. Their frontend matches on `external_id` against the list for that section only, so an `ibn` item is never on a test and a Reading id can't take a Math question out. Both rules are copied rather than guessed, and pinned in the tests on both sides. 2,019 of the 3,767 questions are on a test, so excluding them leaves 1,748, which is 753 reading and writing and 995 math.

That list gets written to `data/live.json` in pass 1 and `normalize` turns it into a `live` column, so pass 3 stays a pure function of what's on disk and a `lookup` that fails costs you the filter rather than the build. The static build keeps the same list in IndexedDB and re-reads it whenever it re-reads the index.

### Explanations
Each rationale arrives as one HTML blob covering all four choices, and [bluebank/rationale.py](bluebank/rationale.py) splits it into a piece per choice. It cuts the HTML rather than flattened text, so MathML and inline SVG survive, and each piece gets rebalanced because the cuts land in the middle of a paragraph.

The wording varies more than you'd expect. `&nbsp;` shows up inside "Choice A&nbsp;is", the letter is sometimes wrapped in a tag, rejections come grouped as "Choices A, B, and C are incorrect", the verb goes missing in "Choice B incorrect.", and the `ibn` items use "<p>Incorrect Answer Rationale<br>" headers with no terminating period. Two shapes have to not match. "choice D is the only graph that passes through the point" is a mid sentence reference, and "Choices B and D show models of the form" is a plural reference rather than a rejection. Splitting on either of those truncates somebody's explanation.

The same file recovers the answer key for the 81 `ibn` items that ship without one, by reading it back out of the rationale prose. Ambiguity is flagged rather than guessed at, and `key_recovered` marks every question whose key came from there instead of from College Board's own field.

`normalize` cross checks the split against the key. Exactly one per choice explanation has to read as "correct" and it has to be the keyed choice. That agrees on all but two multiple choice questions, and both of those are real defects in College Board's own text, where the options were reordered and the prose wasn't updated. Left alone they'd tell a student who picked D that they were right, so their per choice mapping gets dropped and you see the whole rationale instead.

`python -m bluebank audit` should report exactly 3. The third is a question whose rationale never names choice A at the start of a sentence, so A is the only choice with no explanation of its own and the other three keep theirs. More than 3 means something in the parser broke.

### Grading
`correct_answer` is a list, and it mixes two different things: alternate spellings of one value like `["0.25", "1/4"]`, and genuinely different valid answers like `["7", "8", "13"]` for "one possible value of a". Grading is a membership test either way, so the review screen shows every accepted form rather than the first one.

A response is also accepted if it's numerically equal to a listed answer, so typing 1.5 for a listed 3/2 is right. That comparison uses exact rational arithmetic, `Fraction` in Python and a BigInt fraction in TypeScript. Floats get 3/17 wrong.

### Ordering
Sets are ordered by `shuffle_key`, which is FNV-1a over the question id with a splitmix64 finalizer, in [bluebank/db.py](bluebank/db.py) and mirrored in [web/src/lib/shuffle.ts](web/src/lib/shuffle.ts). The two return identical values and the tests pin them. Without it, section sorts before domain and you get every Math question before the first Reading one. With it, question 40 is the same question tomorrow, after a rebuild, and on the other backend, because the key comes from the id rather than from stored state.

The finalizer isn't optional. Raw FNV-1a barely reaches the high bits, which are the ones a sort reads, so every id starting with the same letter lands together and the shuffle is really a sort by first character.

The set clock comes from [web/src/lib/pacing.ts](web/src/lib/pacing.ts), which holds the two numbers the whole thing rests on: 32 minutes for 27 reading and writing questions, 35 for 22 math. A set is priced per question from those, since it can be any length and can mix the sections.

### Vendored Assets
MathJax is vendored at [web/public/mathjax/mml-svg.js](web/public/mathjax) and outputs SVG, so there are no font files to fetch and it works offline. Noto is self hosted in [web/src/fonts](web/src/fonts) rather than loaded from Google, since a font CDN sees the IP of every visitor whether or not they ever sign in.

Two things do reach out, and only when you ask for them. Desmos loads from their CDN the first time you open the calculator, running in their restricted testing mode (the `restrictedFunctions` option, which is what College Board uses). Google's sign-in script isn't fetched until you click sign in, so someone who never opens the account panel never talks to Google at all.

### Tests
```
python -m unittest discover tests   # 92
cd web && npm test                  # 112
```

The rationale parser and the grader exist in both Python and TypeScript, and the TypeScript ports were checked against the Python by running both over the whole corpus: every rationale split identically, every explanation classified identically, every recovered key identical. The HTML in the committed cases is paraphrased rather than copied, so no question content is in the repo.
