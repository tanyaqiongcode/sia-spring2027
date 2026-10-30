#!/usr/bin/env python3
"""update_feeds.py 的单元测试：RSS 解析与「失败保留旧数据」合并逻辑（网络无关）。"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import update_feeds as uf  # noqa: E402


def rss(*items: str) -> bytes:
    body = "".join(
        f"<item><title>T{i}</title><link>https://e.example/{i}</link><pubDate>Thu, 29 Oct 2026 0{i}:00:00 GMT</pubDate></item>"
        for i in items
    )
    return f"<rss><channel>{body}</channel></rss>".encode()


def rss_with_enclosure() -> bytes:
    return (
        b"<rss><channel>"
        b"<item><title>EP1</title><pubDate>Thu, 29 Oct 2026 01:00:00 GMT</pubDate>"
        b"<enclosure url='https://audio.example/ep1.mp3' type='audio/mpeg'/></item>"
        b"<item><title></title><link>https://e.example/9</link></item>"
        b"</channel></rss>"
    )


class TestParseFeed(unittest.TestCase):
    def test_basic_items(self):
        items = uf.parse_feed(rss("1", "2", "3"))
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["title"], "T1")
        self.assertEqual(items[0]["link"], "https://e.example/1")
        self.assertTrue(items[0]["date"].startswith("Thu, 29 Oct 2026"))

    def test_caps_at_max_items(self):
        items = uf.parse_feed(rss(*[str(i) for i in range(12)]))
        self.assertEqual(len(items), uf.MAX_ITEMS)

    def test_enclosure_link_fallback_and_no_title_skipped(self):
        items = uf.parse_feed(rss_with_enclosure())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["link"], "https://audio.example/ep1.mp3")
        self.assertEqual(items[0]["audio"], "https://audio.example/ep1.mp3")


def old_data(*ids_with_items: tuple[str, int]) -> dict:
    return {
        "updated": "2026-10-29T00:00:00+00:00",
        "feeds": [
            {"id": fid, "name": fid, "url": f"https://x/{fid}", "items": [f"old-{i}" for i in range(n)]}
            for fid, n in ids_with_items
        ],
    }


class TestMerge(unittest.TestCase):
    def test_fresh_replaces_old(self):
        all_fresh = {f["id"]: ["new-1", "new-2"] for f in uf.FEEDS}
        out = uf.merge(old_data(("cnn10", 5)), all_fresh)
        feed = next(f for f in out["feeds"] if f["id"] == "cnn10")
        self.assertEqual(feed["items"], ["new-1", "new-2"])
        self.assertNotIn("stale", feed)
        self.assertFalse(out["partial"])

    def test_failed_feed_keeps_last_good_data(self):
        prev = old_data(("cnn10", 5), ("ft-bilingual", 3))
        out = uf.merge(prev, {"cnn10": ["new-1"]})  # ft-bilingual 本次失败
        ft = next(f for f in out["feeds"] if f["id"] == "ft-bilingual")
        self.assertEqual(ft["items"], ["old-0", "old-1", "old-2"])
        self.assertTrue(ft["stale"])
        self.assertTrue(out["partial"])

    def test_failed_feed_without_history_gets_empty_stale(self):
        out = uf.merge(None, {"cnn10": ["x"]})
        bbc = next(f for f in out["feeds"] if f["id"] == "bbc-globalnews")
        self.assertEqual(bbc["items"], [])
        self.assertTrue(bbc["stale"])

    def test_all_feeds_present_even_if_all_failed(self):
        out = uf.merge(None, {})
        self.assertEqual([f["id"] for f in out["feeds"]], [f["id"] for f in uf.FEEDS])
        self.assertTrue(out["partial"])

    def test_legacy_extra_feed_preserved(self):
        prev = old_data(("legacy-source", 2))
        out = uf.merge(prev, {"cnn10": ["x"]})
        legacy = next(f for f in out["feeds"] if f["id"] == "legacy-source")
        self.assertEqual(len(legacy["items"]), 2)

    def test_updated_timestamp_present(self):
        out = uf.merge(None, {"cnn10": ["x"]})
        self.assertIn("updated", out)


if __name__ == "__main__":
    unittest.main()
