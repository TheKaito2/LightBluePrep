# Content fixes

Every change to how a College Board question is shown, made because the
question itself (its key, choices or explanation) was verified to be wrong.
Questions are never hosted or edited here; a fix changes only what the app
shows alongside College Board's own text.

| Date | Question ID | What was wrong | How it was verified | Fix |
| :--- | :--- | :--- | :--- | :--- |
| 2026-10-29 | 1e11190a | The explanation says "Choice C is correct", but its working ends at 5 pints of blackberries, which is choice B, and both College Board's key (B) and its `keys` uuid point to B. The explanation's letters are stale from an old choice order. | Solved 5.50r + 3b = 37, 6.50r + 8b = 66 by hand: r = 4, b = 5 (choice B). | A note above the full explanation says its letters differ from the choices shown. The per-choice explanations were already withheld for this item. |
| 2026-10-29 | bf5f80c6 | The explanation says "Choice D is correct" and "Choices A, B, and C are incorrect", but the point it proves is (-4, 0), which is choice A, College Board's key. | Checked y < -4x + 4 at every choice: only (-4, 0) holds (0 < 20). | Same note as above. |
| 2026-10-29 | 429fb7c0 (and 19 others) | College Board's key lists -.3266, -.3267 and -49/150, but its explanation says -0.326 and -0.327 are also correct (Bluebook accepts a rounded or cut-short decimal that fills the box). A student's -0.326 was marked wrong. 20 grid-ins have this gap. | Graded every form the explanations list (214 across 84 grid-ins): all accepted except c6e85cd7's "0.219", a College Board typo for 0.291 (7/24 = 0.2916...). | Fixed in the grader, not the content: the fill-the-box rule (grading.ts / grading.py). |
