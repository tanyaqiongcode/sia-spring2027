#!/usr/bin/env python3
"""抓取公开播客/双语新闻 RSS，生成 data/latest.json 供 materials.html 展示。
仅在 GitHub Actions 定时任务与手动触发时运行。

容错约定：
- 单个源失败不影响其他源；
- 失败的源保留上次成功结果并标记 stale=True（供前端展示「展示上次成功结果」）；
- 全部源失败时不写文件、以非零退出（CI 不提交，仓库保留上次数据）。"""
import copy
import json
import ssl
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

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
DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "latest.json"


def parse_feed(data: bytes) -> List[dict]:
    """解析 RSS/XML 字节流为条目列表（网络无关，便于单测）。"""
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
    return items


def fetch_feed(feed) -> List[dict]:
    req = urllib.request.Request(feed["url"], headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30, context=ssl.create_default_context()) as resp:
        return parse_feed(resp.read())


def merge(previous: Optional[dict], fresh: Dict[str, List[dict]]) -> dict:
    """合并本次抓取结果与上次数据：成功的源用新数据，失败的源保留旧数据并标记 stale。"""
    old_feeds = (previous or {}).get("feeds", [])
    out_feeds = []
    for feed in FEEDS:
        fid = feed["id"]
        if fid in fresh:
            out_feeds.append({
                "id": fid,
                "name": feed["name"],
                "url": feed["url"],
                "items": fresh[fid],
            })
            continue
        old = next((x for x in old_feeds if x.get("id") == fid), None)
        if old:
            entry = copy.deepcopy(old)
            entry["name"] = feed["name"]  # 名称以当前配置为准
            entry["stale"] = True
            out_feeds.append(entry)
        else:
            out_feeds.append({
                "id": fid,
                "name": feed["name"],
                "url": feed["url"],
                "items": [],
                "stale": True,
            })
    # 保留 FEEDS 之外的历史条目（例如已下线的旧源）
    known = {f["id"] for f in FEEDS}
    for old in old_feeds:
        if old.get("id") not in known:
            out_feeds.append(copy.deepcopy(old))
    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "partial": len(fresh) < len(FEEDS),
        "feeds": out_feeds,
    }


def main() -> None:
    previous = None
    if DATA_FILE.exists():
        try:
            previous = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = None

    fresh: Dict[str, List[dict]] = {}
    for feed in FEEDS:
        try:
            fresh[feed["id"]] = fetch_feed(feed)
            print(f"OK   {feed['name']}")
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {feed['name']}: {exc}", file=sys.stderr)

    if not fresh:
        print("all feeds failed; keeping last good data", file=sys.stderr)
        sys.exit(1)

    out = merge(previous, fresh)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stale = sum(1 for f in out["feeds"] if f.get("stale"))
    print(f"wrote {DATA_FILE} ({len(fresh)}/{len(FEEDS)} feeds fresh, {stale} stale)")


if __name__ == "__main__":
    main()
