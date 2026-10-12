"""Tell Bing (and the other IndexNow engines: DuckDuckGo's source, Yandex, Seznam,
Naver) that the sitemap's pages exist or changed. No account needed: the key
file in web/public proves we own the site.

    python3 scripts/indexnow.py

Run after a deploy that adds or changes pages. Google does not use IndexNow;
it reads sitemap.xml (submitted in Search Console).
"""
import json
import re
import urllib.request
from pathlib import Path

PUBLIC = Path("web/public")
HOST = "lightblueprep.pages.dev"

# The key file is the one *.txt whose name is its own content.
key = next(p.stem for p in PUBLIC.glob("*.txt") if p.read_text().strip() == p.stem)
urls = re.findall(r"<loc>([^<]+)</loc>", (PUBLIC / "sitemap.xml").read_text())
body = json.dumps({
    "host": HOST, "key": key, "keyLocation": f"https://{HOST}/{key}.txt", "urlList": urls,
}).encode()
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, method="POST",
                             headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=30) as res:
    print(res.status, f"submitted {len(urls)} urls")
