/* 通用脚本：导航高亮 / 倒计时 / 每日打卡 / 今日推荐 / 口试判分器 / 资源星数 / 最新素材
   安全约定：所有远程数据（RSS）与用户数据（localStorage）一律经 textContent / safeUrl 渲染，
   全文件除「今日推荐」的自有文案外不使用 innerHTML。 */
(function () {
  "use strict";

  /* ---------- 共享工具（selftest 页通过 window.SIA 检测） ---------- */
  var SIA = window.SIA = window.SIA || {};

  SIA.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // 只放行 http(s) 链接，拦截 javascript: / data: 等协议
  SIA.safeUrl = function (u, base) {
    try {
      var url = new URL(u, base || location.href);
      return (url.protocol === "http:" || url.protocol === "https:") ? url.href : null;
    } catch (e) { return null; }
  };

  // 历史记录聚合（v2 句级记录 + v1 数字兼容）：同一句/段重评时按键覆盖，不重复计数
  SIA.dayAgg = function (day) {
    if (!day || typeof day !== "object") return { ok: 0, close: 0, miss: 0, pass: 0, fail: 0 };
    var out = { ok: day.ok || 0, close: day.close || 0, miss: day.miss || 0, pass: day.pass || 0, fail: day.fail || 0 };
    var marks = day.marks || {};
    Object.keys(marks).forEach(function (k) {
      var v = marks[k];
      if (v === "ok") out.ok++; else if (v === "close") out.close++; else if (v === "miss") out.miss++;
      else if (v === "pass") out.pass++; else if (v === "fail") out.fail++;
    });
    return out;
  };

  /* ---------- 导航高亮 ---------- */
  var page = (location.pathname.split("/").pop() || "index.html");
  document.querySelectorAll(".topbar nav a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === page) a.classList.add("active");
  });

  /* ---------- 倒计时 ---------- */
  var cd = document.querySelector("[data-countdown]");
  if (cd) {
    var targets = JSON.parse(cd.getAttribute("data-countdown"));
    var today = new Date(); today.setHours(0, 0, 0, 0);
    cd.textContent = "";
    targets.forEach(function (t) {
      var cell = document.createElement("div");
      cell.className = "cd-cell" + (t.hot ? " hot" : "");
      var big = document.createElement("b");
      var label = document.createElement("span");
      label.textContent = t.label;
      var note = document.createElement("small");
      if (t.date) {
        var d = new Date(t.date + "T00:00:00");
        var days = Math.round((d - today) / 86400000);
        big.textContent = days > 0 ? days + " 天" : days === 0 ? "今天！" : "已过 " + (-days) + " 天";
        note.textContent = t.date + " · " + t.note;
      } else {
        var reg = new Date(targets[0].date + "T00:00:00");
        var wr = new Date(targets[1].date + "T00:00:00");
        var or = new Date(targets[2].date + "T00:00:00");
        big.textContent = Math.round((wr - today) / 86400000) + " 天";
        label.textContent = "到笔试";
        note.textContent = "到口试 " + Math.round((or - today) / 86400000) + " 天 · " + t.note;
      }
      cell.appendChild(big);
      cell.appendChild(label);
      cell.appendChild(note);
      cd.appendChild(cell);
    });
  }

  /* ---------- 每日打卡（localStorage） ---------- */
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  var checkin = document.querySelector("[data-checkin]");
  if (checkin) {
    var items = checkin.querySelectorAll("input[type=checkbox]");
    var store = {};
    try { store = JSON.parse(localStorage.getItem("sia-checkin") || "{}"); } catch (e) {}
    var dateEl = checkin.querySelector(".date");
    if (dateEl) {
      var wd = "日一二三四五六"[new Date().getDay()];
      dateEl.textContent = "今天是 " + todayKey() + " 星期" + wd;
    }
    var streak = 0;
    (function countStreak() {
      var d = new Date(), done = 0;
      while (true) {
        var k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        var rec = store[k];
        if (rec && rec.filter(Boolean).length >= 3) { streak++; d.setDate(d.getDate() - 1); } else break;
        if (streak > 3650) break;
      }
    })();
    var streakEl = checkin.querySelector(".streak");
    if (streakEl) streakEl.textContent = "🔥 连续 " + streak + " 天";

    items.forEach(function (cb, i) {
      var rec = store[todayKey()] || [];
      cb.checked = !!rec[i];
      cb.addEventListener("change", function () {
        var rec2 = store[todayKey()] || new Array(items.length).fill(false);
        rec2[i] = cb.checked;
        store[todayKey()] = rec2;
        localStorage.setItem("sia-checkin", JSON.stringify(store));
        location.reload();
      });
    });
  }

  /* ---------- 今日推荐（按日期轮换；文案为仓库内自有内容，允许加粗标签） ---------- */
  var daily = document.querySelector("[data-daily]");
  if (daily) {
    var pool = JSON.parse(daily.getAttribute("data-daily"));
    var dayIndex = Math.floor(Date.now() / 86400000);
    var pick = pool[dayIndex % pool.length];
    daily.querySelector(".emoji").textContent = pick.emoji;
    daily.querySelector("b").textContent = pick.title;
    daily.querySelector("p").innerHTML = pick.desc; // 唯一 innerHTML：仓库内自有文案（含 <b>）
    var link = daily.querySelector("a");
    if (link) link.href = pick.href;
  }

  /* ---------- 口试判分器（8 段及格/不及格，三态循环） ---------- */
  var pf = document.querySelector("[data-pf]");
  if (pf) {
    var verdict = document.querySelector("[data-pf-verdict]");
    pf.querySelectorAll(".pf-unit").forEach(function (u) {
      u.addEventListener("click", function () {
        if (u.classList.contains("pass")) {
          u.classList.remove("pass");
          u.classList.add("fail");
        } else if (u.classList.contains("fail")) {
          u.classList.remove("fail");
        } else {
          u.classList.add("pass");
        }
        var passes = pf.querySelectorAll(".pf-unit.pass").length;
        var fails = pf.querySelectorAll(".pf-unit.fail").length;
        if (verdict) {
          if (fails >= 3) {
            verdict.textContent = "❌ 不合格：不及格段落已达 " + fails + "/8（≥三分之一即判不合格）——漏译点逐段复盘，下套模拟针对性补。";
            verdict.className = "pf-verdict bad";
          } else if (passes >= 6) {
            verdict.textContent = "✅ 合格：" + passes + "/8 段及格（≥ 三分之二）。按这个状态进考场就够。";
            verdict.className = "pf-verdict good";
          } else {
            verdict.textContent = "当前 " + passes + " 及格 / " + fails + " 不及格——还差 " + (6 - passes) + " 段达到及格线。";
            verdict.className = "pf-verdict";
          }
        }
      });
    });
  }

  /* ---------- 资源页：实时星数 ---------- */
  var starEls = document.querySelectorAll("[data-stars]");
  if (starEls.length) {
    starEls.forEach(function (el) {
      var repo = el.getAttribute("data-stars");
      fetch("https://api.github.com/repos/" + repo)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && typeof j.stargazers_count === "number") {
            el.textContent = "★ " + j.stargazers_count.toLocaleString();
            if (j.pushed_at) el.title = "最近推送：" + j.pushed_at.slice(0, 10);
          }
        })
        .catch(function () {});
    });
  }

  /* ---------- 素材页：最新更新（由 GitHub Actions 每日抓取） ----------
     数据来自外部 RSS：标题/链接一律消毒后再进 DOM。 */
  var feeds = document.querySelector("[data-feeds]");
  if (feeds) {
    fetch("data/latest.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.feeds) return;
        var grid = document.createElement("div");
        grid.className = "grid c3";
        var shown = 0;
        j.feeds.forEach(function (f) {
          if (!f.items || !f.items.length) return;
          shown++;
          var card = document.createElement("div");
          card.className = "card";
          var h3 = document.createElement("h3");
          h3.textContent = f.name;
          if (f.stale) {
            var staleTag = document.createElement("span");
            staleTag.className = "badge mid";
            staleTag.textContent = "展示上次成功结果";
            h3.appendChild(document.createTextNode(" "));
            h3.appendChild(staleTag);
          }
          card.appendChild(h3);
          var ul = document.createElement("ul");
          ul.style.paddingLeft = "20px";
          ul.style.margin = "8px 0 0";
          f.items.slice(0, 6).forEach(function (it) {
            var li = document.createElement("li");
            var href = SIA.safeUrl(it.link, f.url);
            var titleEl = document.createElement(href ? "a" : "span");
            titleEl.textContent = it.title || "(无标题)";
            if (href) {
              titleEl.href = href;
              titleEl.target = "_blank";
              titleEl.rel = "noopener";
            }
            li.appendChild(titleEl);
            if (it.date) {
              var dateEl = document.createElement("span");
              dateEl.className = "feed-date";
              dateEl.textContent = String(it.date).slice(0, 10);
              li.appendChild(dateEl);
            }
            ul.appendChild(li);
          });
          card.appendChild(ul);
          grid.appendChild(card);
        });
        if (shown) {
          feeds.textContent = "";
          feeds.appendChild(grid);
          var foot = document.createElement("p");
          foot.className = "small";
          foot.style.textAlign = "center";
          foot.style.marginTop = "8px";
          foot.textContent = "由 GitHub Actions 每日自动更新 · 抓取于 " + String(j.updated || "").slice(0, 10) +
            (j.partial ? " · 部分源本次抓取失败，保留上次成功结果" : "");
          feeds.appendChild(foot);
        }
      })
      .catch(function () {});
  }
})();
