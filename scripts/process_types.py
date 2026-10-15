"""Build web/public/process-types.json: one solving-process type per question.

College Board's 29 skills are too coarse for "practice similar" (Nonlinear
functions alone is 258 questions solved in very different ways), so each
question gets a finer type named by HOW you solve it. The types and labels are
written by AI agents reading an export of the bank; this script does the two
mechanical ends of that:

  python3 scripts/process_types.py export OUTDIR   # one JSONL per skill
  python3 scripts/process_types.py merge INDIR     # agents' JSON -> public file

The export holds College Board text, so OUTDIR must stay outside the repo. The
merged file holds only question ids and our own type names, no question text.

The public file has been copy-edited by hand since the last merge (Unicode
maths such as b² − 4ac and π/180, plainer tips, the Oxford comma). A fresh
merge overwrites those edits, so carry them into the agents' JSON first.
"""
import html
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

DB = Path("data/bluebank.db")
OUT = Path("web/public/process-types.json")
TRIM = 400


def text(fragment):
    """HTML to plain text. Math images become their spoken alt text."""
    if not fragment:
        return ""
    s = re.sub(r'<img[^>]*?alt="([^"]*)"[^>]*>', r" [\1] ", fragment)
    s = re.sub(r"<img[^>]*>", " [image] ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def export(outdir):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT cb_id, section, skill, skill_name, difficulty, band, type,"
        " stimulus_html, stem_html, options_json, rationale_html FROM questions"
    ).fetchall()
    files, names = {}, {}
    for r in rows:
        options = json.loads(r["options_json"] or "null") or []
        item = {
            "id": r["cb_id"],
            "difficulty": r["difficulty"],
            "band": r["band"],
            "type": r["type"],
            "stimulus": text(r["stimulus_html"])[:TRIM],
            "question": text(r["stem_html"]),
            "choices": [f'{o["label"]}: {text(o["html"])[:160]}' for o in options],
            "explanation": text(r["rationale_html"])[:TRIM],
        }
        # Keyed by code: CB spells one skill two ways ("Cross-text" / "Cross-Text").
        names.setdefault(r["skill"], r["skill_name"].strip())
        files.setdefault((r["section"], r["skill"]), []).append(item)
    for (section, skill), items in sorted(files.items()):
        name = names[skill]
        with open(out / f"{section}-{skill}.jsonl", "w") as f:
            f.write(json.dumps({"skill": skill, "skill_name": name, "count": len(items)}) + "\n")
            for item in items:
                f.write(json.dumps(item) + "\n")
        print(f"{section}-{skill}: {len(items)}  {name}")


def merge(indir):
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    bank = dict(conn.execute("SELECT cb_id, skill FROM questions").fetchall())
    types, q, problems = {}, {}, []
    for path in sorted(Path(indir).glob("*.json")):
        d = json.loads(path.read_text())
        skill = d["skill"]
        keys = {t["key"]: {"label": t["label"], "how": t["how"]} for t in d["types"]}
        types[skill] = keys
        for cb_id, key in d["labels"].items():
            if key not in keys:
                problems.append(f"{skill}: {cb_id} has unknown type {key!r}")
            elif bank.get(cb_id) != skill:
                problems.append(f"{skill}: {cb_id} is not in this skill")
            elif cb_id in q:
                problems.append(f"{skill}: {cb_id} labeled twice")
            else:
                q[cb_id] = f"{skill}.{key}"
        sizes = Counter(v[len(skill) + 1:] for v in q.values() if v.startswith(skill + "."))
        print(f"{skill}: " + ", ".join(f"{keys[k]['label']} {n}" for k, n in sizes.most_common()))
    missing = [cb for cb in bank if cb not in q]
    problems += [f"unlabeled: {cb} ({bank[cb]})" for cb in missing]
    if problems:
        print("\n".join(problems[:50]), f"\n{len(problems)} problems", file=sys.stderr)
        sys.exit(1)
    # Grouped by type rather than one entry per question: the ids are what is
    # left, so the file is half the size. lib/similar.ts inverts it on load.
    grouped = {}
    for cb_id, ref in q.items():
        grouped.setdefault(ref, []).append(cb_id)
    OUT.write_text(json.dumps({"types": types, "q": grouped}, separators=(",", ":"),
                              ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}: {len(q)} questions, {sum(map(len, types.values()))} types")


if __name__ == "__main__":
    {"export": export, "merge": merge}[sys.argv[1]](sys.argv[2])
