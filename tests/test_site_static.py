#!/usr/bin/env python3
"""站点静态检查：JS 引用的元素 id 必须存在于页面、锚点可达、meta 标签齐全、
渲染层不使用 innerHTML（注入防线），JS/Python 语法可编译。"""
import re
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_FILES = sorted(ROOT.glob("*.html"))
JS_FILES = sorted((ROOT / "assets").glob("*.js"))

ID_RE = re.compile(r'id="([^"]+)"')
JQ_ID_RE = re.compile(r'\$\("#([A-Za-z0-9_-]+)"\)')
HREF_RE = re.compile(r'href="([^"]+)"')


class TestIds(unittest.TestCase):
    def collect_ids(self):
        ids: dict[str, set[str]] = {}
        for f in HTML_FILES:
            ids[f.name] = set(ID_RE.findall(f.read_text(encoding="utf-8")))
        return ids

    def test_js_referenced_ids_exist(self):
        """JS 里 $("#xxx") 引用的元素必须在某个页面里真实存在——
        防止「元素缺失导致运行时中断」这类回归（本站曾因此坏过判分器）。"""
        all_ids = set().union(*self.collect_ids().values())
        for js in JS_FILES:
            for ref in JQ_ID_RE.findall(js.read_text(encoding="utf-8")):
                self.assertIn(ref, all_ids, f"{js.name} 引用的 #{ref} 不存在于任何页面")

    def test_local_anchors_resolve(self):
        page_ids = self.collect_ids()
        pages = {f.name for f in HTML_FILES}
        for f in HTML_FILES:
            text = f.read_text(encoding="utf-8")
            for href in HREF_RE.findall(text):
                if href.startswith(("http://", "https://", "data:", "mailto:")):
                    continue
                if href.startswith("#"):
                    self.assertIn(href[1:], page_ids[f.name],
                                  f"{f.name} 的页内锚点 {href} 找不到目标")
                elif ".html" in href:
                    target, _, anchor = href.partition("#")
                    self.assertIn(target, pages, f"{f.name} 链接了不存在的页面 {target}")
                    if anchor:
                        self.assertIn(anchor, page_ids.get(target, set()),
                                      f"{f.name} 的锚点 {href} 在 {target} 中不存在")


class TestMeta(unittest.TestCase):
    def test_each_page_has_description_and_og(self):
        for f in HTML_FILES:
            text = f.read_text(encoding="utf-8")
            self.assertIn('<meta name="description"', text, f"{f.name} 缺 description")
            self.assertIn('property="og:title"', text, f"{f.name} 缺 og:title")
            self.assertIn('property="og:url"', text, f"{f.name} 缺 og:url")

    def test_nav_links_selftest(self):
        for f in HTML_FILES:
            text = f.read_text(encoding="utf-8")
            self.assertIn('href="selftest.html"', text, f"{f.name} 导航缺自检入口")

    def test_official_site_linked(self):
        for f in HTML_FILES:
            text = f.read_text(encoding="utf-8")
            self.assertIn("https://www.shwyky.net", text, f"{f.name} 未链接官网 shwyky.net")


class TestSecurity(unittest.TestCase):
    ASSIGN_RE = re.compile(r"\.innerHTML\s*=")

    def code_lines(self, js: Path):
        """非注释代码行（忽略纯注释行，避免把文档性提及当成赋值）。"""
        for line in js.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(("//", "*", "/*")):
                continue
            yield line

    def test_practice_js_no_innerhtml(self):
        text = (ROOT / "assets" / "practice.js").read_text(encoding="utf-8")
        hits = [l for l in self.code_lines(ROOT / "assets" / "practice.js") if self.ASSIGN_RE.search(l)]
        self.assertEqual(hits, [], "practice.js 禁止任何 innerHTML 赋值（用户/RSS 数据注入防线）")
        self.assertNotIn("insertAdjacentHTML", text)

    def test_main_js_innerhtml_whitelisted(self):
        """main.js 仅允许清空（= ""）与「今日推荐」自有文案一处。"""
        hits = [l for l in self.code_lines(ROOT / "assets" / "main.js") if self.ASSIGN_RE.search(l)]
        for line in hits:
            is_clear = re.search(r"\.innerHTML\s*=\s*[\"']{2}", line)
            is_own_copy = "pick.desc" in line
            self.assertTrue(is_clear or is_own_copy, f"main.js 出现未白名单的 innerHTML 赋值：{line.strip()}")
        self.assertTrue(any("pick.desc" in l for l in hits), "今日推荐的自有文案渲染应仍存在")


class TestSyntax(unittest.TestCase):
    def test_js_compiles(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node 不可用")
        for js in JS_FILES:
            subprocess.run([node, "--check", str(js)], check=True)

    def test_python_compiles(self):
        for py in sorted((ROOT / "scripts").glob("*.py")) + sorted((ROOT / "tests").glob("*.py")):
            subprocess.run([sys.executable, "-m", "py_compile", str(py)], check=True)


if __name__ == "__main__":
    unittest.main()
