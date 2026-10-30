/* LS7Core — 共享基础模块：安全渲染、听写统计、定档逻辑。
   浏览器与 Node 双端可用（window.LS7Core / require）。
   安全约定：所有不可信内容（用户粘贴文本、RSS 标题/链接）一律以 textContent
   渲染，绝不进入 innerHTML；外链仅放行 http(s)，其余协议（javascript:、data: 等）
   一律降级为纯文本。本模块是 assets/main.js、practice.js、placement.js 与 tests/
   自动化测试的唯一渲染与统计实现，站点间（雅思站/高口站）保持同源复用。 */
(function (global) {
  "use strict";

  var SAFE_LINK = /^https?:\/\//i;

  /* 仅放行 http/https；返回规范化 URL 或 null（null 表示按纯文本渲染）。 */
  function sanitizeLink(url) {
    if (typeof url !== "string") return null;
    var u = url.trim();
    return SAFE_LINK.test(u) ? u : null;
  }

  /* DOM 构造辅助：doc 参数化以便 Node 测试注入假 DOM。 */
  function makeEl(doc, tag, className, text) {
    var n = doc.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /* 渲染 RSS 节目列表：恶意标题只会成为文本节点，恶意链接被过滤为纯文本。 */
  function renderFeedList(doc, container, feeds, maxPerFeed) {
    container.textContent = "";
    var grid = makeEl(doc, "div", "grid c3");
    (feeds || []).forEach(function (feed) {
      var items = ((feed && feed.items) || []).slice(0, maxPerFeed || 6);
      if (!items.length) return;
      var card = makeEl(doc, "div", "card");
      card.appendChild(makeEl(doc, "h3", null, feed.name));
      var ul = makeEl(doc, "ul");
      items.forEach(function (item) {
        var li = makeEl(doc, "li");
        var href = sanitizeLink(item && item.link);
        if (href) {
          var a = makeEl(doc, "a", null, (item && item.title) || "(无标题)");
          a.setAttribute("href", href);
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
          li.appendChild(a);
        } else {
          li.appendChild(makeEl(doc, "span", null, (item && item.title) || "(无标题)"));
        }
        if (item && item.date) li.appendChild(makeEl(doc, "span", "feed-date", String(item.date).slice(0, 10)));
        ul.appendChild(li);
      });
      card.appendChild(ul);
      grid.appendChild(card);
    });
    container.appendChild(grid);
    return grid;
  }

  /* 听写正确率：ok=1 分、close=0.5 分、miss=0 分；无已评分句子时 acc 为 null。 */
  function calcDictationScore(statuses) {
    var done = 0, ok = 0, close = 0, miss = 0;
    (statuses || []).forEach(function (s) {
      if (!s) return;
      done++;
      if (s === "ok") ok++;
      else if (s === "close") close++;
      else if (s === "miss") miss++;
    });
    return {
      done: done, ok: ok, close: close, miss: miss,
      acc: done ? Math.round((ok + close * 0.5) / done * 100) : null
    };
  }

  /* 本地日期键（打卡/统计按用户本地时区，避免 UTC 偏移导致的日子漂移）。 */
  function localDateKey(d) {
    var t = d || new Date();
    return t.getFullYear() + "-" +
      String(t.getMonth() + 1).padStart(2, "0") + "-" +
      String(t.getDate()).padStart(2, "0");
  }

  /* ---------- 定位测试（训练分组参考，非标准化测评） ---------- */

  var TIER_LABELS = { "5-7": "5–7 分档", "7-8": "7–8 分档", "8-9": "8–9 分档" };

  /* 阈值是"训练分组"经验值（短板决定起点），不是分数换算。 */
  function tierOf(pct) {
    if (pct >= 75) return "8-9";
    if (pct >= 45) return "7-8";
    return "5-7";
  }

  /* 词汇量估算：从第 1 行起连续"都认识"的行数 → 估算区间。 */
  function vocabEstimate(rowAnswers) {
    var consecutive = 0;
    var rows = rowAnswers || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] === 1) consecutive++;
      else break;
    }
    var map = [
      { est: "≈ 3000 或以下", pct: 0 },
      { est: "≈ 4000", pct: 25 },
      { est: "≈ 6000", pct: 50 },
      { est: "≈ 9000", pct: 75 },
      { est: "≈ 12000+", pct: 100 }
    ];
    return map[Math.min(consecutive, map.length - 1)];
  }

  /* 定位结果：先校验完成度（全部项目作答、盲听每句至少播放一次），
     再按三维（词汇/盲听/口语）取短板档位。缺项时 complete=false 并给出缺失清单。 */
  function placementResult(input) {
    input = input || {};
    var vocab = input.vocabRows;
    var listen = input.listenMarks;
    var speak = input.speakMarks;
    var playCounts = input.playCounts || [];

    var missing = [];
    var vocabBad = !Array.isArray(vocab) || vocab.length !== 5 ||
      vocab.some(function (v) { return v !== 0 && v !== 1; });
    if (vocabBad) missing.push("模块 A：5 行词表需逐行作答（基本都认识 / 有生词）");

    var listenBad = !Array.isArray(listen) || listen.length !== 4 || listen.some(function (m, i) {
      return (m !== 0 && m !== 1 && m !== 2) || (playCounts[i] || 0) < 1;
    });
    if (listenBad) missing.push("模块 B：4 句盲听需每句至少播放一次并标记听懂程度");

    var speakBad = !Array.isArray(speak) || speak.length !== 6 ||
      speak.some(function (s) { return s !== 0 && s !== 1; });
    if (speakBad) missing.push("模块 C：6 道自评需全部作答（符合 / 不符合）");

    if (missing.length) return { complete: false, missing: missing };

    var v = vocabEstimate(vocab);
    var lTotal = 0;
    listen.forEach(function (m) { lTotal += m; });
    var listenPct = Math.round(lTotal / (listen.length * 2) * 100);
    var sYes = 0;
    speak.forEach(function (s) { if (s === 1) sYes++; });
    var speakPct = Math.round(sYes / speak.length * 100);
    var tiers = { vocab: tierOf(v.pct), listen: tierOf(listenPct), speak: tierOf(speakPct) };
    var order = { "5-7": 0, "7-8": 1, "8-9": 2 };
    var weakest = [tiers.vocab, tiers.listen, tiers.speak]
      .sort(function (a, b) { return order[a] - order[b]; })[0];

    return {
      complete: true,
      vocabEst: v.est, vocabPct: v.pct,
      listenPct: listenPct, speakPct: speakPct,
      tiers: tiers, weakest: weakest, weakestLabel: TIER_LABELS[weakest]
    };
  }

  var api = {
    sanitizeLink: sanitizeLink,
    makeEl: makeEl,
    renderFeedList: renderFeedList,
    calcDictationScore: calcDictationScore,
    localDateKey: localDateKey,
    tierOf: tierOf,
    vocabEstimate: vocabEstimate,
    placementResult: placementResult,
    TIER_LABELS: TIER_LABELS
  };

  global.LS7Core = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
