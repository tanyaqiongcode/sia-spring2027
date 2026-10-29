/* 通用脚本：导航高亮 / 倒计时 / 每日打卡 / 今日推荐 / 口试判分器 / 资源星数 / 最新素材 */
(function () {
  "use strict";

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
    cd.innerHTML = "";
    targets.forEach(function (t) {
      var cell = document.createElement("div");
      cell.className = "cd-cell" + (t.hot ? " hot" : "");
      if (t.date) {
        var d = new Date(t.date + "T00:00:00");
        var days = Math.round((d - today) / 86400000);
        var big = days > 0 ? days + " 天" : days === 0 ? "今天！" : "已过 " + (-days) + " 天";
        cell.innerHTML = "<b>" + big + "</b><span>" + t.label + "</span><small>" + t.date + " · " + t.note + "</small>";
      } else {
        // 到笔试 / 口试的备考天数
        var reg = new Date(targets[0].date + "T00:00:00");
        var wr = new Date(targets[1].date + "T00:00:00");
        var or = new Date(targets[2].date + "T00:00:00");
        cell.innerHTML = "<b>" + Math.round((wr - today) / 86400000) + " 天</b><span>到笔试</span><small>到口试 " + Math.round((or - today) / 86400000) + " 天 · " + t.note + "</small>";
      }
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

  /* ---------- 今日推荐（按日期轮换） ---------- */
  var daily = document.querySelector("[data-daily]");
  if (daily) {
    var pool = JSON.parse(daily.getAttribute("data-daily"));
    var dayIndex = Math.floor(Date.now() / 86400000);
    var pick = pool[dayIndex % pool.length];
    daily.querySelector(".emoji").textContent = pick.emoji;
    daily.querySelector("b").innerHTML = pick.title;
    daily.querySelector("p").innerHTML = pick.desc;
    var link = daily.querySelector("a");
    if (link) link.href = pick.href;
  }

  /* ---------- 口试判分器（8 段及格/不及格） ---------- */
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

  /* ---------- 素材页：最新更新（由 GitHub Actions 每日抓取） ---------- */
  var feeds = document.querySelector("[data-feeds]");
  if (feeds) {
    fetch("data/latest.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.feeds) return;
        var html = "";
        j.feeds.forEach(function (f) {
          if (!f.items || !f.items.length) return;
          html += '<div class="card"><h3>' + f.name + "</h3>";
          html += '<ul style="padding-left:20px;margin:8px 0 0">';
          f.items.slice(0, 6).forEach(function (it) {
            html += '<li><a href="' + it.link + '" target="_blank" rel="noopener">' + it.title + "</a>";
            if (it.date) html += '<span class="feed-date">' + it.date.slice(0, 10) + "</span>";
            html += "</li>";
          });
          html += "</ul></div>";
        });
        if (html) {
          feeds.innerHTML = '<div class="grid c3">' + html + "</div>" +
            '<p class="small" style="text-align:center;margin-top:8px">由 GitHub Actions 每日自动更新 · 抓取于 ' + (j.updated || "").slice(0, 10) + "</p>";
        }
      })
      .catch(function () {});
  }
})();
