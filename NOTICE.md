# Notice of modification

LightBluePrep is a modified version of **Bluebank**
(https://github.com/jackwangxyw/Bluebank, Copyright its contributors),
distributed under the GNU General Public License v3 (see LICENSE).

Modified by TheKaito2 (https://github.com/TheKaito2). Changes include:

- 2026-10-06: Home page rebuilt as a question browser: filter sidebar with a
  domain/skill tree, full question list with per-question status, Hide done,
  Mixed / By topic / Random ordering, open-at-first-unanswered.
- 2026-10-06: College Board question IDs stored (`questions.cb_id`) and shown
  in the list and on each question, with copy and YouTube search.
- 2026-10-08: Rebranded as LightBluePrep (name, logo, favicon, link preview,
  About and privacy pages); upstream sync endpoints removed from the build;
  optional donation link.
- 2026-10-08: Own Google sign-in and sync: Worker `lightblueprep-sync` with its
  own D1 database and OAuth client; privacy page updated for accounts;
  YouTube button searches the bare question ID.
- 2026-10-08: Phone layout: bottom tab bar, one-row toolbar, two-line list
  rows, filters as a bottom sheet, compact question header.
- 2026-10-08: Support links (Ko-fi in the nav, Ko-fi and Buy Me a Coffee on
  About); privacy page lists the donation platforms.
- 2026-10-08: Question ID search on the home list; anonymous bug/feedback
  form (Worker /feedback, rate limited) with an owner-only inbox.
- 2026-10-08: Security headers (CSP, frame blocking) via web/public/_headers;
  review fixes (feedback kind, inbox cap, privacy wording, a11y roles).
- 2026-10-08: Topic-first Home (question list removed; ID search opens a
  question directly), streaks and an estimated-score trend (lib/progress.ts,
  /api/history), Support popup with Ko-fi, Buy Me a Coffee and PromptPay.
- 2026-10-08: Design system (web/src/tokens.css, DESIGN.md): section colours
  (Reading and Writing pink, Math light blue), icons instead of emoji,
  asymmetric progress layout, loading skeletons.
- 2026-10-08: Bolder identity: Bricolage Grotesque display type, coloured
  hero band, section panels (pink / light blue), filled progress tiles, dark
  start bar with a chunky Start button.
- 2026-10-08: No gradients (flat colour, clipped discs); new nav with icon pill
  tabs; solid-colour page heads for Review (amber), Stats (mint) and About
  (ink); Stats, Review and About restyled with section panels and cards.
- 2026-10-08: Resources page (Khan Academy, James Lu SAT) and a 404 page.
- 2026-10-08: Third-party license notices (web/public/third-party-licenses.txt),
  linked from About and the README; PromptPay option wired (off until QR set).
- 2026-10-08: Removed the upstream author's Desmos API key (Desmos keys are
  per-developer). Key now comes from VITE_DESMOS_KEY; without one the
  Calculator button opens desmos.com/calculator in a new tab.
- 2026-10-08: Own Desmos API key (free Personal plan) set, embedded calculator
  back on.
- 2026-10-08: PromptPay QR added to the Support popup (cropped to the code,
  metadata stripped).
- 2026-10-08: Practice: Info button (ID, difficulty, score band) replaces the
  ID and difficulty beside Mark for Review; Math reference sheet (own
  drawings); mistake log asked inline only after a wrong answer, drawer
  removed. Review: Marked filter (answered or not) and mistake-type chips
  under "Has a note".
- 2026-10-08: New logo (Bulb's face) and mascot Bulb in four moods, drawn
  as SVG from concept art made with OpenAI image generation; new link
  preview card (source in web/og/).
- 2026-10-10: Review: "Redo a whole pile" tiles at the top practise every
  question in a category (All, Incorrect, Marked, Has a note, each mistake
  type) in one go.
- 2026-10-10: Every question gets a solving-process type (179 types across
  the 29 skills, written by AI from the question bank; web/public/
  process-types.json holds only ids and our type names). Review shows the type
  on each row, "Practice N similar" under each question, and a Redo button per
  section. Build script: scripts/process_types.py.
- 2026-10-10: Home: ticking a skill shows its process types as chips, to
  narrow that skill to one or more types.
- 2026-10-12: Security and reliability audit. Fixed: practice after leaving a
  set had no Submit button; edits made during a sync could be reverted and
  never synced; deleted sets came back (now synced tombstones); a first
  sign-in with over 2,000 changes lost the excess. Question HTML is sanitized
  before rendering. The sync Worker now rate-limits sign-in and sync,
  caps request size and sessions, validates every stored row, and keeps row
  counts instead of counting every sync (migration in worker/migrations/).
  The local Python server only answers its own page and Vite on a loopback
  host name. Removed two unused dependencies (and with them every audit
  finding), tightened the image policy, added HSTS, and replaced upstream's
  GitHub Pages workflow with a test-only CI.
- 2026-10-12: Anonymous usage counts. Cloudflare Web Analytics for page views
  (no cookies), and a once-per-browser ping to the sync Worker at the first and
  tenth question answered, with no ID; the Worker keeps daily totals in a new
  `milestones` table (migration in worker/migrations/). Privacy policy and
  About updated to match.
- 2026-10-12: Links into the app (?q= question, ?skill=, ?type=) and a Link
  button in Info; a static page per skill under /skills/ with the sitemap
  (scripts/skill_pages.py); web app manifest and 512px icons; structured data
  on the home page; IndexNow submission (scripts/indexnow.py); usage totals
  in the feedback inbox; a daily watchdog workflow for the site, the Worker
  and College Board's API.
- 2026-10-12: Relabeled the question types for Inferences (now 5) and
  Cross-text Connections (now 4), whose old types overlapped; 178 types in
  all.

The full history of changes is in the git log.
