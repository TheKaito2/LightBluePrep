# LightBluePrep design system

Tokens live in [`web/src/tokens.css`](web/src/tokens.css). Components read tokens; they do not hard-code hex values. The practice screen keeps its Bluebook look (palette at the top of `web/src/styles/base.css`, the screen itself in `styles/bluebook.css` and `styles/bluebook-tools.css`) so test day feels familiar. This system covers everything around it.

## Colour

| Role | Token | Use |
|---|---|---|
| Brand | `--brand-50 … --brand-700` (light blue) | Logo, focus rings, score chart, links in the support popup |
| Reading and Writing | `--rw-*` (rose pink) | Anything that belongs to R&W: topic cards, section tab, score bar |
| Math | `--math-*` (light blue, cooler than brand) | Anything that belongs to Math |
| Streak | `--streak-*` (amber orange) | Streak icon and day dots only |
| Neutrals | `--n-0 … --n-900` (one cool grey ramp) | Text, borders, surfaces. Never mix in warm greys |
| Status | `--green`, `--amber-ink`, `--red` (+ `-soft`) | Correct / partly / wrong, accuracy badges, difficulty |
| Primary action | `--accent` (College Board royal blue) | Start, Submit, primary buttons. The same blue as the practice screen |

**Shade rules (measured WCAG contrast):**
- `*-700`: text on white or on its own `*-50` tint (6.5:1 or better).
- `*-600`: filled buttons and pills with white text (4.7:1 or better).
- `*-500` and lighter: bars, icons, borders. Never text.

**Section scope:** add `.sec-RW` or `.sec-MATH` to a container and use `var(--sec-500)` and friends inside it. The same component then colours itself correctly for either section, with no props or conditionals.

## Type
Two families, both self-hosted (no font CDN, for privacy and the CSP):
- **Display: Bricolage Grotesque** (`var(--display)`, OFL, bundled from `@fontsource-variable/bricolage-grotesque`). Used for headlines, big numbers, section and topic names, tabs, buttons and the wordmark. Set it heavy (750–800) with tight tracking (−0.025em to −0.045em).
- **Body: Noto Sans** (`var(--sans)`) for running text, skill names and form controls. The practice screen stays Noto/Bluebook.

Hierarchy is deliberately loud:

| Element | Size |
|---|---|
| Hero headline | 68px (42px on phone) |
| Page or section title | 36–48px |
| Topic card title | 21px |
| Body | 14.5px |

Numbers use `font-variant-numeric: tabular-nums` so they don't jitter.

## Space, radius, elevation, motion
- **Space:** 4px grid, `--sp-1` (4) to `--sp-10` (40).
- **Radius:** `--rad-sm` 8 for chips and icons, `--rad-md` 12 for inputs and rows, `--rad-lg` 16 for cards, `--rad-pill` for buttons and segmented controls.
- **Elevation:** shadows are tinted toward the page blue and never pure black. `--sh-1` is resting cards, `--sh-2` hover, `--sh-3` dialogs.
- **Motion:** `--ease-out`, with `--dur-fast` (140ms) for state and `--dur-base` (260ms) for layout. Animate only `transform` and `opacity`. Everything respects `prefers-reduced-motion`.

## Icons
- **Source:** hand-drawn 24×24 stroke icons in [`web/src/components/Icon.tsx`](web/src/components/Icon.tsx). There is no icon dependency.
- **Stroke:** 2 in the UI, 2.2 to 3 for tiny glyphs like the checkbox tick.
- **No emoji** anywhere in the interface.
- **Section icons:** `book` for Reading and Writing, `sigma` for Math. Use them wherever a section is named.

## Colour coverage
Colour sits on surfaces, not just accents. Aim for about 20% of the screen.

**No gradients.** Use flat fills only. For decoration, use solid discs clipped by a band's edge.

**Every page has a tone**, set by a solid header band (`PageHead`, `.phead.tone-*`):

| Page | Tone |
|---|---|
| Practice (Home) | light blue (`--brand-100`) |
| Review | amber (`--streak-100`) |
| Stats | mint (`--mint-100`) |
| Resources | rose (`--rw-100`) |
| About | dark ink (`--n-900`) |
| 404 (`web/public/404.html`) | light blue, static |

What colour sits where:
- **Hero band:** solid `--brand-100` with a pink and a blue disc.
- **Section panels:** each section is a solid `--sec-100` panel holding white cards. The same panel is used on Home, Stats and Review.
- **Progress tiles:** the streak and coverage tiles are filled (amber and pink).
- **Start bar:** dark ink, with a light-blue chunky button.

Text on any colour still follows the shade rules above.

## Buttons
The primary call to action is chunky (Duolingo-style):
- **Shape:** a pill in `--brand-500` with dark text.
- **Depth:** a 4px `--brand-700` bottom edge.
- **Pressed:** it presses down 4px.

Secondary buttons are quiet pills. On the dark start bar, use translucent white.

## Navigation
- **Desktop:** a 66px white bar with the display-font wordmark (clicking it goes home), then icon + label pill tabs. The active tab is filled ink with a light-blue icon. A pink Support pill sits on the right.
- **Phone:** the tabs become a bottom bar with icons over labels, and the active one sits in a light-blue pill.

## Patterns
- **Cards** only where they group something you act on (topic cards, progress). Otherwise use spacing and hairlines.
- **States:**
  - **Loading:** skeletons shaped like the content, not spinners.
  - **Empty:** say how to fill the space ("Unlocks after 10 questions in each section").
  - **Pressed:** `scale(.99)` or `translateY(1px)`.
- **Dialogs** share one shell (`.fb-dialog`): centred on desktop, a bottom sheet on phones, Escape to close, focus returns to the opener.
- **Phone:** tabs move to a bottom bar. The progress strip shrinks to one row of numbers so the topics stay on the first screen.
