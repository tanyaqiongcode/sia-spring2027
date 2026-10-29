#!/usr/bin/env python3
"""抓取公开播客/双语新闻 RSS，生成 data/latest.json 供 materials.html 展示。
仅在 GitHub Actions 定时任务与手动触发时运行；单个源失败不影响其他源。"""
import json
import ssl
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

FEEDS = [
    {
        "id": "bbc-globalnews",
        "name": "BBC Global News Podcast",
        "url": "https://downloads.bbc.co.uk/podcasts/worldservice/globalnews/rss.xml",
    },
    {
        "id": "cnn10",
        "name": "CNN 10",
        "url": "https://feeds.megaphone.fm/WMHY2232473209",
    },
    {
        "id": "bbc-bizdaily",
        "name": "BBC Business Daily",
        "url": "https://downloads.bbc.co.uk/podcasts/worldservice/bizdaily/rss.xml",
    },
    {
        "id": "ft-bilingual",
        "name": "FT中文网 · 双语阅读",
        "url": "https://www.ftchinese.com/rss/feed",
    },
]

HEADERS = {"User-Agent": "sia-spring2027/1.0 (feed updater)"}
MAX_ITEMS = 8


def fetch_feed(feed):
    req = urllib.request.Request(feed["url"], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30, context=ssl.create_default_context()) as resp:
        data = resp.read()
    root = ET.fromstring(data)
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if not title:
            continue
        enclosure = item.find("enclosure")
        if enclosure is not None and link == "":
            link = enclosure.get("url", "")
        items.append({
            "title": title,
            "link": link,
            "date": (item.findtext("pubDate") or "").strip(),
            "audio": enclosure.get("url", "") if enclosure is not None else "",
        })
        if len(items) >= MAX_ITEMS:
            break
    return {"id": feed["id"], "name": feed["name"], "url": feed["url"], "items": items}


def main():
    out = {"updated": datetime.now(timezone.utc).isoformat(), "feeds": []}
    ok = 0
    for feed in FEEDS:
        try:
            out["feeds"].append(fetch_feed(feed))
            ok += 1
            print(f"OK   {feed['name']}")
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {feed['name']}: {exc}", file=sys.stderr)
    dest = Path(__file__).resolve().parent.parent / "data" / "latest.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {dest} ({ok}/{len(FEEDS)} feeds)")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
