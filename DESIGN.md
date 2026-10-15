# LightBluePrep design system

Tokens live in [`web/src/tokens.css`](web/src/tokens.css). Components read tokens; they do not hard-code hex values. The shared primitives (buttons, chips, segmented controls, badges, inputs, cards, section panels, meters, toasts, dialogs, focus) are in [`web/src/styles/shell.css`](web/src/styles/shell.css). The practice screen keeps its Bluebook look (palette at the top of `web/src/styles/base.css`, the screen itself in `styles/bluebook.css` and `styles/bluebook-tools.css`) so test day feels familiar. This system covers everything around it.

## Principles

- **One blue acts.** Outside practice, `--brand-700` (#1479c2) with white text is the only interactive fill.
- **No decoration. Color is data.** Pink means Reading and Writing, blue means Math, green, amber and red mean correct, partly and incorrect, orange means streak. Surfaces are white, near-white or ink. No discs, stripes, tinted shadows or colored borders used as ornament.
- **Type carries the boldness.** Heavy Bricolage at a few fixed sizes against quiet Noto. One loud headline and one hero number per screen.
- **Hairlines over shadows.** Structure comes from 1px borders. Shadows are only for things that float. Nothing lifts on hover.
- **No gradients.** Flat fills only. The single exception is `--rule`, the dashed Bluebook rule on the practice screen.
- **No emoji** anywhere in the interface.

## Scope: practice versus everything else

- Every page except practice renders under `.shell`; practice renders under `.app`. Scope shell styles through `.shell`, never by adding a class to practice.
- The Bluebook names `--sans`, `--serif`, `--ink`, `--ink-2`, `--muted`, `--line`, `--line-2`, `--bg`, `--bg-soft`, `--chrome*`, `--band`, `--accent*`, `--green`, `--red`, `--yellow`, `--amber-ink`, `--r-*`, `--shadow` and `--rule` belong to practice. Never redefine them in `tokens.css`, and do not use them under `.shell`: use the `--surface-*`, `--fg-*`, `--hair-*`, `--ok-*`, `--warn-*`, `--bad-*` roles instead. The one exception is the question detail on Review and Results, which reuses practice components; `review.css` maps those names onto shell tokens for the dark theme.
- College Board royal blue (`--accent`) appears only on the practice screen. Practice buttons and chips are `.app .btn` and `.app .chip` in `bluebook.css`.

## Color

| Role | Tokens | Use |
|---|---|---|
| Surfaces | `--surface`, `--surface-subtle`, `--surface-sunken`, `--surface-raised`, `--surface-ink`, `--surface-ink-2`, `--surface-hero`, `--scrim` | Page and cards; row hover; tracks and disabled fills; the on segment; ink bands, start bar, toasts; controls on ink; the Home hero; behind dialogs |
| Text | `--fg-1` … `--fg-4`, `--fg-inv-1` … `--fg-inv-3`, `--fg-link` | Primary, secondary, meta, placeholder; the same on ink; links |
| Borders | `--hair-1`, `--hair-2`, `--hair-ctl`, `--hair-inv` | Cards and rows; chips and secondary buttons; inputs, checkboxes and card hover (3:1); controls on ink |
| Brand | `--brand-50 … --brand-900` | `700` text, borders and focus, `800` small text on brand tints, `600` bars and icons only |
| Fills under white text | `--fill-brand`, `--fill-brand-hover`, `--fill-brand-press`, `--fill-bad`, `--rw-fill`, `--math-fill` (`--sec-fill`) | Primary and danger buttons, the Results band, Bulb's base. Fixed in both themes |
| Reading and Writing | `--rw-*` | Anything that belongs to R&W, nothing else |
| Math | `--math-*` | Anything that belongs to Math |
| Status | `--ok-*`, `--warn-*`, `--bad-*` | Correct / partly / incorrect, difficulty Easy / Medium / Hard |
| Streak | `--streak-*` | Streak icon and day dots only |

**Shade rules (measured WCAG contrast):**
- `*-700`: text on white or on its own `*-50` tint.
- `*-600`: section header blocks and fills with white text (`--brand-600` is the exception: bars and icons only, never white text).
- `*-500` and lighter: bars, dots, icons. Never text.
- On `--brand-50`/`--brand-100`, small text is `--brand-800`; `--brand-700` there only at 24px and above.

**Dark theme** (`prefers-color-scheme: dark`, no toggle). Every page except practice. The dark block in `tokens.css` swaps the surfaces, text, borders, shadows, the `*-50`/`*-100` tints (deep washes of the same hue) and the `*-700`/`800` text shades (light, so they read on dark). `*-500`/`600` and the `--fill-*` tokens do not change, so white text on a fill keeps its contrast. The colour block is declared on `.app` as well as `:root`, which keeps practice light the way Bluebook is; a token the dark block changes must live in that block. Text that sits on a `--fg-1` fill uses `--surface` (it inverts with it), and dark text on a white or orange pill uses `--surface-ink`. `public/static.css` mirrors the subset the static pages use.

**Section scope:** add `.sec-RW` or `.sec-MATH` to a container and use `var(--sec-500)` and friends inside it. The same component then colors itself for either section, with no props or conditionals.

## Bands

| Page | Band |
|---|---|
| Home | light brand hero (`--surface-hero`) |
| Review, Stats, Resources, About, Inbox | ink band (`--surface-ink`) |
| Settings | gray band (`--surface-sunken`) |
| Results | section band (`--sec-fill`, ink for mixed sets) |
| Practice | Bluebook |

Every band is `PageHead`; its numbers go in one `StatGroup` of `<Stat size="l">` cells (the stat strip). Section headings below a band use `.h1-section`.

## Type

Two families, both self-hosted (no font CDN, for privacy and the CSP):
- **Display: Bricolage Grotesque** (`var(--display)`) for headlines, numbers, panel and row titles and the wordmark. Never in buttons, tabs, chips or labels.
- **Body and UI: Noto Sans** (`var(--sans)`). Noto ships 400 to 700: never ask it for 750 or 800.

Every role is a shorthand: `font: var(--type-x); letter-spacing: var(--tr-x)`. Phone values (under 820px) switch automatically.

| Token | Use | Desktop | Phone | Weight |
|---|---|---|---|---|
| `--type-display` | Home hero headline, 404 | 64/64 | 40/42 | 800 |
| `--type-title` | Page title in the band | 44/46 | 32/34 | 800 |
| `--type-h1` | Section heading ("Topics", "Where to focus") | 32/36 | 24/28 | 800 |
| `--type-h2` | Panel, card and dialog titles | 20/26 | 19/24 | 750 |
| `--type-h3` | Row titles (skill, topic card, set name) | 16/22 | 16/22 | 700 |
| `--type-lead` | Page subtitle, hero sub | 17/26 | 16/24 | 400 |
| `--type-body` | Prose, dialog body | 15/24 | 15/24 | 400 |
| `--type-ui` | Buttons, tabs, chips, row meta | 14/20 | 14/20 | 500 (600 buttons and tabs) |
| `--type-input` | Every input, textarea and select | 16/22 | 16/22 | 400 |
| `--type-small` | Helper text, meta, footnotes | 13/18 | 13/18 | 400 (600 labels) |
| `--type-label` | Eyebrows and stat labels only, uppercase | 12/16 | 12/16 | 650 |
| `--type-badge` | Status and count badges, phone tab labels | 12/16 | 12/16 | 600 |

Numbers are Bricolage with `font-variant-numeric: tabular-nums lining-nums`: `--num-xl` 72/56 (estimated score, Results score), `--num-l` 36/28 (band stat cells), `--num-m` 28/24 (card figures), `--num-s` 20/18 (section scores, row accuracy). A unit suffix (`/ 1600`, `days`, `%`) is Noto 600 in `--fg-3`, about 0.4 times the numeral and never under 13px.

Rules:
- **12px floor.** Nothing outside practice is under 12px.
- **16px inputs.** Every field is 16px so iOS Safari never zooms the page.
- **Uppercase only for `--type-label`.** Everything else is sentence case.
- No more than two display sizes on a screen, not counting numerals.
- Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`. Body lines stay under 68ch, leads under 52ch.

## Space, radius, elevation

- **Space:** 4px grid, `--sp-1` (4) to `--sp-20` (80). Page gutter 32 (16 on phone); cards 12 apart; rows touch, divided by a hairline.
- **Radius:** `--rad-xs` 6 (badges, checkboxes, kbd), `--rad-sm` 8 (buttons, inputs, tabs, segmented items, icon tiles), `--rad-md` 12 (cards, popovers, toasts), `--rad-lg` 16 (dialogs, section panels, sheets), `--rad-pill` (chips, status badges, dots, meters). **Buttons are never pills.**
- **Elevation:** `--sh-0` every resting card; `--sh-1` a hovered clickable card or sticky chrome; `--sh-2` popovers and menus; `--sh-3` dialogs and sheets; `--sh-bar` the sticky start bar. Hover changes border, background or color only, never position.
- **Motion:** color changes 120ms (`--dur-fast`, `--ease-std`); press `translateY(1px)` 80ms; animate only `transform` and `opacity`. One global `prefers-reduced-motion` rule (end of `base.css`) makes every transition and animation finish at once; the sync dot turns solid and the skeleton holds at .8.

## Breakpoints

| Name | Width | What changes |
|---|---|---|
| Phone | 819px and under | 52px header, five-tab bottom bar, phone type scale, dialogs become bottom sheets, single-column layouts |
| Compact desktop | 820 to 1149px | Nav tabs and Support drop to icons except the active tab; GitHub hidden (the footer links it) |
| Desktop | 1150px and up | Everything labelled |

## Components (`shell.css`)

**Nav** (`.tabs`, `App.tsx`). Desktop: 64px `--surface` bar over a `--hair-1` hairline, `--sh-1` once the page scrolls. Brand is the 28px mark plus the Bricolage 19/800 wordmark ("Blue" in `--brand-700`), 32px before the tabs. Tabs run the full bar height, padding 0 14, `--type-ui` 600 in `--fg-2` with an 18px `--fg-3` icon; hover is `--fg-1` over a 2px `--hair-2` bar, active is `--fg-1`, a `--brand-700` icon and a 3px `--brand-700` bar on the bottom edge. Results counts as Review. The right cluster (gap 8) is Settings and GitHub as 36px quiet icon buttons, Support as a quiet button with a `--rw-600` heart, then Sync: secondary sm "Sign in to sync" with a cloud, or a 24px avatar plus the 8px status dot once signed in. Phone: a 52px header with the 24px mark, the 18px wordmark and 40px icon buttons (Support, Settings, Sync; the dot only when signed in), and a bottom bar of five tabs (Practice, Review, Stats, Resources, About), 60px plus the safe area, hairline top, no shadow or blur, 22px icon over a 12px/600 label, the active icon on a 56x28 `--brand-100` pill in `--brand-800`. Marks under 40px draw the simplified tick-on-tile, never the face.

**Footer** (`Footer.tsx`, `.foot`): on every page but practice, after the content (inside Home's own scroller, above the start bar). "Free forever · No ads · No account needed", the College Board line, then All SAT skills, Privacy, Source and Send feedback; 13px `--fg-3` over a `--hair-1` top hairline.

**Buttons** (`.btn`). Noto 600, `--rad-sm`, 16px icon with an 8px gap, a trailing arrow only on forward actions.

| Size | Height | Padding-x | Font |
|---|---|---|---|
| `.sm` | 32 | 12 | 13/600 |
| default | 40 | 16 | 14/600 |
| `.lg` | 48 | 20 | 15/600 |

| Variant | Rest | Hover | Pressed | Disabled |
|---|---|---|---|---|
| `.primary` | `--fill-brand`, white, `inset 0 -1px 0 rgba(0,0,0,.18)` | `--fill-brand-hover` | `--fill-brand-press`, `translateY(1px)` | `--surface-sunken`, `--fg-4` |
| default / `.secondary` | `--surface`, `1px --hair-2`, `--fg-1` | `--surface-subtle`, `--hair-ctl` | `--surface-sunken` | `--fg-4`, `--hair-1` |
| `.quiet` | transparent, `--fg-2` | `--surface-subtle`, `--fg-1` | `--surface-sunken` | `--fg-4` |
| `.danger` | `--fill-bad`, white | `--bad-800` | `--bad-900` | as primary |
| `.danger-secondary` (first click of anything destructive) | `--surface`, `1px --bad-200`, `--bad-700` | `--bad-50` | `--bad-50` | as secondary |
| `.on-ink` | as primary | as primary | as primary | `rgba(255,255,255,.08)`, `--fg-inv-3` |
| `.on-ink-secondary` | `rgba(255,255,255,.06)`, `1px --hair-inv`, white | `.12` | `.16` | `--fg-inv-3` |
| `.on-colour` (on a section header block) | `--surface`, `--sec-700` | `--sec-50` | `translateY(1px)` | n/a |

**Chips** (`.chip`): 32px pill, `1px --hair-2`, `--type-ui` in `--fg-2`. On is `--fg-1` with white text (`--sec-600` inside a section). Difficulty chips stay neutral and carry an 8px dot (`--ok-500`, `--warn-500`, `--bad-500`). Counts go in `.chip-n`. On ink: translucent white at rest, white when on.

**Segmented control** (`.seg` / `.seg-b`) for any single choice: `--surface-sunken` track, 32px items, the active one `--surface-raised` with `--sh-1`.

**Status badge** (`.badge.ok | .bad | .warn | .neutral`): 22px pill, optional 12px icon, `--type-badge`, the status's soft fill and text color. Words: Correct, Incorrect, Partly. No fixed width.

**Inputs:** 40px, `--rad-sm`, `1px --hair-ctl`, 16px text, `--fg-4` placeholder; focus is a `--brand-700` border plus `--focus-ring`. Selects (`.sel`) use a 12px stroke chevron in `--fg-3`. Checkboxes are 18px with `accent-color: var(--brand-700)`, always beside their label.

**Cards** (`.card`): `--surface`, `1px --hair-1`, `--rad-md`, padding 20 (16 on phone), no shadow. Clickable: border `--hair-ctl` and `--sh-1` on hover. Selected: `inset 0 0 0 2px var(--sec-600)` plus `--sec-50`. Icon tiles (`.ico-tile`) are 32px, `--rad-sm`, `--surface-subtle`. No card inside a card.

**Section panel** (`.spanel`): white, `1px --hair-1`, `--rad-lg`, with a solid `--sec-600` header block (`.spanel-h`) holding a translucent icon tile, a white `--type-h2` title and an optional on-colour action.

**Rows** (Review, Results): at least 56px, padding 12 16, hairline between, `--surface-subtle` on hover; the open row keeps the tint and a 2px `--sec-500` bar. Index squares are 28px ink with white numerals. Day dividers are `--type-label` in `--fg-3`.

**Meters** (`.meter` / `.meter-fill`): 6px pill on `--surface-sunken`, filled in the section color (brand elsewhere). Render a fill only above zero; it is never thinner than 4px.

**Skeleton** (`.skel`): flat `--surface-sunken`, pulsing opacity 1 to .55 over 1.2s.

**Toasts** (`Toast.tsx`, `useToast()`): ink, `--rad-md`, 44px, bottom center 16px above any bar, one at a time, `role="status"`. Confirmations clear after 4s; errors stay until dismissed. Optional Undo in `--brand-300`.

**Dialogs** (`Modal.tsx`, `.modal`): every dialog goes through it. `--rad-lg`, `--sh-3` over `--scrim`, width 520 (Options 560). Header padding 20 24 with a `--type-h2` title and a 32px quiet close (`.modal-x`, `aria-label="Close"`); a hairline appears under it once the body scrolls. Body padding 0 24 24, scrolls on its own with `overscroll-behavior: contain`. Footer padding 16 24 over a hairline, primary last. Focus goes to Close (or a field marked `autoFocus`), Tab stays inside, Escape closes, focus returns to the opener. Phones get a bottom sheet: 36x4 `--hair-2` grab handle, top radius 16, `max-height: 88dvh`, stacked full-width footer buttons with the primary first.

**Stat tiles** (`Stat.tsx`): label (`--type-label`), number (`--num-m`, `--num-l` in a band), optional sub and meter. Grouped tiles share one bordered `StatGroup` with hairline dividers.

**Empty states** (`EmptyState.tsx`): centered, 380 wide: Bulb 72px, `--type-h3` title, one `--fg-3` sentence, at most one primary button.

**Destructive actions** (`ConfirmDelete.tsx`): a quiet trash icon button; the first click swaps it for a danger-secondary "Delete?" and a quiet "Keep", with focus on Keep.

**Focus:** one rule, `.shell :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`. On ink the ring is `--focus-inv`, on the hero `--fg-1`, on a section header white. Text fields use their border and halo instead. No global box-shadow ring.

## Bulb

Bulb appears only where it means something, at most once per screen: the Home hero (88px), the Results band (72px; `cheer` at 70% and up, `neutral` 40 to 69%, `oops` below), empty states (72px) and the 404 page (96px). Never on a working card, never on a `--brand-600` or `--brand-700` fill, never on the practice screen.

## Icons
- **Source:** hand-drawn 24×24 stroke icons in [`web/src/components/Icon.tsx`](web/src/components/Icon.tsx). There is no icon dependency.
- **Stroke:** 2 in the UI, 2.2 to 3 for tiny glyphs like the checkbox check mark.
- **Section icons:** `book` for Reading and Writing, `sigma` for Math. Use them wherever a section is named.

## Patterns
- **States:** loading shows skeletons shaped like the content, not spinners. Empty states say how to fill the space ("Unlocks after 10 questions in each section").
- **Phone:** tabs move to a bottom bar. The progress strip shrinks to one row of numbers so the topics stay on the first screen.

## Voice and words

The interface talks like a helpful older student: short, plain, and direct. These rules cover every string a student reads, in the app, the skill pages, `llms.txt`, and the error messages.

- **Voice:** _the owner picks one voice (DS-52)._ The choice is "I" (a solo student project) or "we". Until then, About, Feedback, and Resources say "I", and Settings and the privacy policy say "our server".
- **American English.** practice (noun and verb), initialize, color, center, gray, behavior, neighbor. Never "practise", "initialise", "colour", or "maths".
- **Device-neutral verbs.** Select, pick, choose, or open. Never "tap", which reads wrong on a desktop, and never "tick", which is British for checking a box. "One click away" is fine where it describes effort, not a gesture.
- **Contractions.** Write "you're", "can't", "doesn't", "isn't", and "it's", the way a person talks. Keep the full forms only in the legal sentences of `privacy.html`, the College Board disclaimer, and text that mirrors College Board's official directions.
- **Oxford comma.** Always: "filter, track, and re-drill". It matches College Board's own names ("Ratios, Rates, Proportional Relationships, and Units"). Code that joins a list does the same (`describe()` in Settings).
- **Section names.** "Reading and Writing" and "Math", in full. "R&W" only where the full name cannot fit (`SECTION_SHORT`). Never "Reading & Writing", "English", or "Maths".
- **Capitalization.** Sentence case for headings, buttons, tabs, and labels. Title Case only for labels that mirror Bluebook ("Mark for Review", "Check Your Work", "Go to Review Page") and for College Board's domain and skill names.
- **Numbers.** Counts go through `fmt()` ("1,107"); plurals through `plural()` and `noun()` in `lib/labels.ts`. Time spent goes through `duration()`: "45s", "1m 05s", "2m", "1h 28m"; the running clock is `m:ss`. Speed uses the multiplication sign: "1×", "0.75×", never "x".

**Glossary.** The words for an answer's outcome and for progress. The source of truth is `VERDICT` and `TAG_LABEL` in [`web/src/lib/labels.ts`](web/src/lib/labels.ts); every screen uses these words and no others.

| Say | Meaning | Never |
|---|---|---|
| Correct | Right on the first try | Right, First try |
| Incorrect | Wrong answer | Wrong |
| Unanswered | No answer submitted | Blank, Skipped |
| Correct on retry | Wrong first, right later | Retried |
| answered | Has at least one submitted answer ("64 answered") | seen, attempted |
| Not tried yet | A skill or type with no answers | Never seen |
| Bank progress | New questions answered, out of the whole bank | Bank covered |
| All questions | No status filter | Everything |
| Process, Careless, Knowledge, Other | Mistake log tags | Silly |
| Easy, Medium, Hard | Difficulty | E/M/H in prose |
