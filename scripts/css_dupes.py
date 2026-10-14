"""List every selector declared more than once under the same media query.

usage: python3 scripts/css_dupes.py [file.css ...]
       (default: web/src/styles/*.css)

A selector counts once per rule it appears in, so `.a, .b { }` declares both
`.a` and `.b`. Pairs are keyed by the full @media/@supports context, so `.a`
at the top level and `.a` inside `@media (max-width: 819px)` are different
pairs. The check runs across all the files given, because they load as one
cascade. Exits 1 if any pair repeats, so it can gate CI.
"""
import glob
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def strip_comments(text):
    # Keep newlines so reported line numbers stay true.
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def split_selectors(prelude):
    # Commas inside :is()/:not()/:where() do not separate selectors.
    out, depth, cur = [], 0, ""
    for ch in prelude:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(norm(cur))
            cur = ""
        else:
            cur += ch
    out.append(norm(cur))
    return [s for s in out if s]


def rules(path):
    """Yield (selector, context, line) for every style rule in a file. The line
    is where the rule's `{` sits."""
    text = strip_comments(open(path, encoding="utf-8").read())
    stack = []  # (prelude, is_container) for each open brace
    start, line, quote = 0, 1, None
    for i, ch in enumerate(text):
        if ch == "\n":
            line += 1
        if quote:
            if ch == quote and text[i - 1] != "\\":
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch == "{":
            prelude = norm(text[start:i])
            container = prelude.startswith(("@media", "@supports", "@layer", "@container"))
            if not container and not prelude.startswith("@") and not any(p.startswith("@keyframes") for p, _ in stack):
                ctx = " ".join(p for p, c in stack if c)
                for sel in split_selectors(prelude):
                    yield sel, ctx, line
            stack.append((prelude, container))
            start = i + 1
        elif ch == "}":
            if stack:
                stack.pop()
            start = i + 1
        elif ch == ";" and (not stack or stack[-1][1]):
            start = i + 1  # a statement at-rule such as @import


def main(argv):
    files = argv or sorted(glob.glob(os.path.join(ROOT, "web/src/styles/*.css")))
    if not files:
        print("no css files found", file=sys.stderr)
        return 2
    seen = defaultdict(list)
    for f in files:
        for sel, ctx, line in rules(f):
            seen[(sel, ctx)].append(f"{os.path.relpath(f, ROOT)}:{line}")
    dupes = {k: v for k, v in seen.items() if len(v) > 1}
    for (sel, ctx), where in sorted(dupes.items(), key=lambda kv: kv[1][0]):
        print(f"{sel}{'  @ ' + ctx if ctx else ''}: {', '.join(where)}")
    print(f"{len(dupes)} repeated selector+media pairs in {len(files)} file(s)", file=sys.stderr)
    return 1 if dupes else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
