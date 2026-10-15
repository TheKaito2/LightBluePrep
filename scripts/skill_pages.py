"""Write web/public/skills/: one static page per SAT skill, an index, the
sitemap, and the skills list at the end of llms.txt.

The app is one JavaScript page at one URL, so a search engine has a single
page to rank. These give each of the 29 skills its own crawlable page: the
skill's name, how many official questions it has, what the skill tests (our
words, from skills_copy.json), and our question types for it (from
process-types.json) with links that open practice straight away (the ?skill=
and ?type= deep links in web/src/App.tsx).

    python3 scripts/skill_pages.py

Reads names and difficulty counts from the local bank (data/bluebank.db, never
committed) and writes only our own text plus College Board's skill names and
counts: no question content. Display names and the domain and skill order
come from web/src/lib/labels.ts, so these pages match the app. Styles live in
web/public/static.css. Re-run after process-types.json, skills_copy.json or
labels.ts changes. Standard library only.
"""
import html
import json
import re
import sqlite3
import subprocess
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import quote

DB = Path("data/bluebank.db")
TYPES = Path("web/public/process-types.json")
COPY = Path("scripts/skills_copy.json")
LABELS = Path("web/src/lib/labels.ts")
OUT = Path("web/public/skills")
SITEMAP = Path("web/public/sitemap.xml")
LLMS = Path("web/public/llms.txt")
PRIVACY = Path("web/public/privacy.html")
SITE = "https://lightblueprep.pages.dev"

SECTIONS = {"RW": "Reading and Writing", "MATH": "Math"}
DIFF = (("E", "Easy"), ("M", "Medium"), ("H", "Hard"))
OG_ALT = "LightBluePrep: every official SAT practice question, free."

# Stroke icons, the same paths as web/src/components/Icon.tsx.
def icon(path, cls=""):
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            f'<path d="{path}"/></svg>')


CHEV = icon("M9 18l6-6-6-6", "row-chev")
BACK = icon("M15 18l-6-6 6-6")
ARROW = icon("M5 12h14M13 6l6 6-6 6")

HEADER = """    <header class="sh">
      <div class="sh-in">
        <a class="sh-brand" href="/">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="2" y="2" width="44" height="44" rx="12" fill="#1479c2"/><path d="M14.5 24.5l6.5 6.5 12.5-13" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="wordmark">Light<b>Blue</b>Prep</span>
        </a>
        <a class="btn primary sm" href="/">Open practice</a>
      </div>
    </header>"""

# The same footer as privacy.html and 404.html (SP-12).
FOOTER = """    <footer class="sf">
      <div class="sf-in">
        <ul class="sf-links" aria-label="Site">
          <li><a href="/">Practice</a></li>
          <li><a href="/skills/"{current}>All skills</a></li>
          <li><a href="/#about">About</a></li>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="https://github.com/TheKaito2/LightBluePrep">Source</a></li>
        </ul>
        <p>LightBluePrep is a free, ad-free student project. Not affiliated with or endorsed by College Board. SAT and Bluebook are trademarks of College Board.</p>
      </div>
    </footer>"""


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def t(s):
    """Escape for HTML, and keep short maths on one line: "x-intercept" gets
    a non-breaking hyphen (U+2011), and the spaces around =, +, −, ×, ± and ÷
    become non-breaking, so "f(x) = mx + b" never splits across lines."""
    s = re.sub(r"\b([a-z])-(?=[a-z])", "\\1\u2011", html.escape(s))
    return re.sub(r" ([=+\u2212\u00d7\u00b1\u00f7]) ", "\u00a0\\1\u00a0", s)


def fmt(n):
    return f"{n:,}"


def ld(data):
    # "</" would end the script element early; JSON allows "<\/".
    return json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")


def cb_order():
    """Domains, skill order and Title Case names from web/src/lib/labels.ts.

    Parsed rather than copied so the static pages cannot drift from the app.
    ponytail: regex over two literal tables; a reshaped labels.ts fails loudly
    here, and the fix is to update these two patterns.
    """
    src = LABELS.read_text()
    domains = re.findall(
        r"\{ code: '([^']+)', section: '(\w+)', name: '([^']+)',\s*skills: \[([^\]]*)\] \}", src)
    block = re.search(r"const SKILL_NAME[^{]*\{(.*?)\n\}", src, re.S)
    names = dict(re.findall(r"^\s*'?([\w.]+)'?: '([^']+)',$", block.group(1) if block else "", re.M))
    if len(domains) != 8 or len(names) < 29:
        raise SystemExit(f"could not read DOMAINS ({len(domains)}) or SKILL_NAME ({len(names)}) from {LABELS}")
    domain_name = {code: name for code, _, name, _ in domains}
    skill_order = [s for *_, skills in domains for s in re.findall(r"'([^']+)'", skills)]
    return [code for code, *_ in domains], domain_name, skill_order, names


def rank(order, code):
    return order.index(code) if code in order else len(order)


def git_date(*paths):
    """The day these files last changed, for <lastmod>: today when one has
    uncommitted edits (they ship with the next commit), else its last commit.
    None outside a git checkout, and the sitemap then leaves lastmod out."""
    try:
        git = lambda *a: subprocess.run(["git", *a, "--", *map(str, paths)],
                                        capture_output=True, text=True, check=True).stdout.strip()
        if git("status", "--porcelain"):
            return date.today().isoformat()
        return git("log", "-1", "--format=%cs") or None
    except (OSError, subprocess.CalledProcessError):
        return None


def mix_bar(d):
    """A 60x6 bar split by the Easy, Medium and Hard counts. Drawn in SVG so
    the widths are attributes, not inline styles."""
    total = sum(d.values()) or 1
    gaps = sum(1 for k, _ in DIFF if d[k]) - 1
    x, rects = 0.0, []
    for k, _ in DIFF:
        if not d[k]:
            continue
        w = d[k] / total * (60 - gaps)
        rects.append(f'<rect class="d-{k}" x="{x:.2f}" width="{w:.2f}" height="6"/>')
        x += w + 1
    label = ", ".join(f"{d[k]} {name}" for k, name in DIFF)
    return (f'<svg class="mix" width="60" height="6" viewBox="0 0 60 6" role="img" '
            f'aria-label="{label}">{"".join(rects)}</svg>')


def page(title, description, path, body, data, section="", index=False):
    url = SITE + path
    e = html.escape
    sec = f" sec-{section}" if section else ""
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{e(title)}</title>
    <meta name="description" content="{e(description)}" />
    <link rel="canonical" href="{url}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#ffffff" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="LightBluePrep" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="{url}" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(description)}" />
    <meta property="og:image" content="{SITE}/og-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="{e(OG_ALT)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <!-- Generated by scripts/skill_pages.py. Edit the script, not this file.
         Styles are in static.css, shared with privacy.html and 404.html. -->
    <link rel="stylesheet" href="/static.css" />
    <script type="application/ld+json">
{ld(data)}
    </script>
  </head>
  <body>
{HEADER}
    <main class="sk{sec}">
{body}
    </main>
{FOOTER.format(current=' aria-current="page"' if index else "")}
  </body>
</html>
"""


def row(href, title, meta, count, extra=""):
    """One link row (spec 7.11). The count sits on the right, and moves under
    the name below 480px where the name needs the width."""
    m = f'<span class="row-m">{meta}</span>' if meta else ""
    return (f'          <li><a class="row" href="{href}"><span class="row-main">'
            f'<span class="row-t">{title}</span>{m}<span class="row-m row-c">{count}</span></span>'
            f'{extra}<span class="row-n">{count}</span>{CHEV}</a></li>')


def main():
    domain_order, domain_names, skill_order, display = cb_order()
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    rows = conn.execute(
        "SELECT section, domain, domain_name, skill, skill_name, difficulty FROM questions"
    ).fetchall()
    pt = json.loads(TYPES.read_text())
    copy = json.loads(COPY.read_text())
    per_type = Counter(pt["q"].values())

    skills = {}
    for section, domain, domain_name, skill, skill_name, difficulty in rows:
        s = skills.setdefault(skill, {
            "code": skill, "section": section, "domain": domain,
            "domain_name": domain_names.get(domain, domain_name.strip()),
            # Slugs come from College Board's name, as they always have, so
            # no URL changes; the page shows the Title Case display name.
            "slug": slug(skill_name), "name": display.get(skill, skill_name.strip()), "diff": Counter(),
        })
        s["diff"][difficulty] += 1
    order = sorted(skills.values(), key=lambda s: (
        s["section"] != "RW", rank(domain_order, s["domain"]), rank(skill_order, s["code"]), s["name"]))
    for s in order:
        s["n"] = sum(s["diff"].values())
        c = copy.get(s["code"])
        if not c:
            raise SystemExit(f"{COPY} has no entry for {s['code']} ({s['name']})")
        words = len(c["what"].split())
        if not 40 <= words <= 80:
            raise SystemExit(f"{COPY} {s['code']}: 'what' is {words} words, keep it to 40-80")
        s["copy"] = c
        s["short"] = c.get("short", s["name"])

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.html"):
        old.unlink()
    sec_slug = {k: slug(v) for k, v in SECTIONS.items()}
    for s in order:
        types = pt["types"].get(s["code"], {})
        count = lambda key: per_type[f"{s['code']}.{key}"]
        ranked = sorted(types.items(), key=lambda kv: -count(kv[0]))
        type_rows = "\n".join(
            row(f'/?type={quote(s["code"] + "." + key)}', t(ty["label"]), t(ty["how"]),
                f"{fmt(count(key))} questions")
            for key, ty in ranked)
        siblings = "\n".join(
            f'          <li><a href="/skills/{o["slug"]}"><span>{t(o["short"])}</span>{CHEV}</a></li>'
            for o in order if o["domain"] == s["domain"] and o is not s)
        d, sec, dom = s["diff"], SECTIONS[s["section"]], s["domain_name"]
        tags = "\n".join(f'        <li class="tag d-{k}">{fmt(d[k])} {name}</li>' for k, name in DIFF)
        body = f"""      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><a href="/skills/">All skills</a></li>
          <li><a href="/skills/#{sec_slug[s["section"]]}">{sec}</a></li>
          <li><a href="/skills/#{slug(dom)}">{t(dom)}</a></li>
        </ol>
      </nav>
      <p class="eyebrow">SAT {sec} · {t(dom)}</p>
      <h1>{t(s["name"])}</h1>
      <p class="lede">{fmt(s["n"])} official College Board practice questions, free, no account needed.</p>
      <ul class="tags" aria-label="Questions by difficulty">
{tags}
      </ul>
      <a class="btn primary lg cta" href="/?skill={quote(s["code"])}">Practice all {fmt(s["n"])} questions {ARROW}</a>
      <section aria-labelledby="tests">
        <h2 id="tests">What this skill tests</h2>
        <p>{t(s["copy"]["what"])}</p>
      </section>
      <section aria-labelledby="on-the-sat">
        <h2 id="on-the-sat">How it shows up on the SAT</h2>
        <p>{t(s["copy"]["how"])}</p>
      </section>
      <section aria-labelledby="types">
        <h2 id="types">{len(types)} question types</h2>
        <p>Every question here is sorted by how you solve it. Pick one type and practice it until it sticks.</p>
        <ul class="rows">
{type_rows}
        </ul>
      </section>
      <section aria-labelledby="more">
        <h2 id="more">More {t(dom)}</h2>
        <ul class="sibs">
{siblings}
        </ul>
      </section>
      <p class="back-all"><a class="btn sm" href="/skills/">{BACK} Every SAT skill</a></p>"""
        crumbs = [("All skills", f"{SITE}/skills/"),
                  (sec, f"{SITE}/skills/#{sec_slug[s['section']]}"),
                  (dom, f"{SITE}/skills/#{slug(dom)}"),
                  (s["name"], None)]
        data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": name, **({"item": item} if item else {})}
            for i, (name, item) in enumerate(crumbs, 1)]}
        (OUT / f"{s['slug']}.html").write_text(page(
            f"{s['short']}: {fmt(s['n'])} free SAT practice questions · LightBluePrep",
            f"{fmt(s['n'])} official College Board SAT practice questions on {s['name']}, free, "
            f"sorted into {len(types)} question types by how you solve them. No account needed.",
            f"/skills/{s['slug']}", body, data, s["section"]))

    groups = []
    for section, sec in SECTIONS.items():
        members = [s for s in order if s["section"] == section]
        inner = []
        for domain in dict.fromkeys(s["domain"] for s in members):
            in_domain = [s for s in members if s["domain"] == domain]
            name = in_domain[0]["domain_name"]
            links = "\n".join(
                row(f'/skills/{s["slug"]}', t(s["name"]), "", f"{fmt(s['n'])} questions", mix_bar(s["diff"]))
                for s in in_domain)
            inner.append(f'        <h3 class="sk-domain" id="{slug(name)}">{t(name)}</h3>\n'
                         f'        <ul class="rows">\n{links}\n        </ul>')
        groups.append(
            f'      <section class="sk-group sec-{section}" aria-labelledby="{sec_slug[section]}">\n'
            f'        <h2 class="sk-h" id="{sec_slug[section]}">{sec} '
            f'<span class="sk-hn">· {fmt(sum(s["n"] for s in members))} questions</span></h2>\n'
            + "\n".join(inner) + "\n      </section>")
    total = sum(s["n"] for s in order)
    body = f"""      <p class="eyebrow brand">Practice by skill</p>
      <h1>Every SAT skill</h1>
      <p class="lede">All {fmt(total)} official College Board practice questions, in the {len(order)} skills
        the Digital SAT tests, each split into question types by how you solve them. Free, no account needed.</p>
      <a class="btn primary lg cta" href="/">Practice all {fmt(total)} questions {ARROW}</a>
{chr(10).join(groups)}"""
    data = {"@context": "https://schema.org", "@type": "ItemList", "name": "Every SAT skill",
            "numberOfItems": len(order), "itemListElement": [
                {"@type": "ListItem", "position": i, "name": s["name"], "url": f"{SITE}/skills/{s['slug']}"}
                for i, s in enumerate(order, 1)]}
    (OUT / "index.html").write_text(page(
        "Every SAT skill, with free practice questions · LightBluePrep",
        f"All {fmt(total)} official College Board SAT practice questions, free, sorted by skill "
        "and by how you solve them. Reading and Writing and Math.",
        "/skills/", body, data, index=True))

    skills_date = git_date(TYPES, COPY)
    urls = ([("/", None), ("/skills/", skills_date)]
            + [(f"/skills/{s['slug']}", skills_date) for s in order]
            + [("/privacy", git_date(PRIVACY))])
    SITEMAP.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{SITE}{u}</loc>{f'<lastmod>{d}</lastmod>' if d else ''}</url>\n"
                  for u, d in urls)
        + "</urlset>\n")

    # Everything above "## Skills" in llms.txt is hand-written; the list is ours.
    head = LLMS.read_text().split("\n## Skills\n")[0].rstrip("\n")
    listing = [f"\n## Skills\n\nOne page per skill, in College Board's order, with its question count "
               f"and question types. {fmt(total)} questions in all."]
    for section, sec in SECTIONS.items():
        listing.append(f"\n### {sec}\n")
        listing += [f"- [{s['name']}]({SITE}/skills/{s['slug']}): {fmt(s['n'])} questions"
                    for s in order if s["section"] == section]
    LLMS.write_text(head + "\n" + "\n".join(listing) + "\n")
    print(f"wrote {len(order)} skill pages, skills/index.html, {len(urls)} sitemap urls and llms.txt skills")


if __name__ == "__main__":
    main()
