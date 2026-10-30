/* 训练台：① 逐句听写工作台（笔试听力）② 口译段落台（只放一遍 + 录音 + 及格制自评）
   纯前端，音频与录音数据不出本机。
   安全约定：全文件不使用 innerHTML；历史存储 v2 = 句级记录（重评按键覆盖，不重复计数）。
   依赖 assets/main.js 提供 window.SIA（esc/safeUrl/dayAgg）。 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var SIA = window.SIA || {};

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---------- 数据导出（全部 sia-* 键 + 当前会话） ---------- */
  var exportBtn = $("#btn-export");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      var payload = { exported: new Date().toISOString(), site: "sia-spring2027", data: {} };
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sia-") === 0) {
          try { payload.data[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { payload.data[k] = localStorage.getItem(k); }
        }
      }
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "sia-练习数据-" + todayKey() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    });
  }

  /* ================= ① 听写工作台 ================= */
  var audio = $("#audio");
  if (audio) {
    var lines = [];          // { text, status: null|'ok'|'close'|'miss' }
    var idx = 0;
    var loopOn = false;
    var ptA = null, ptB = null;
    var sessionId = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var SESSION_KEY = "sia-dictation-session";

    function loadFile(file) {
      if (!file) return;
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(file);
      $("#file-hint").textContent = "🎵 " + file.name;
      $("#bench-body").style.display = "";
    }
    $("#audio-file").addEventListener("change", function (e) { loadFile(e.target.files[0]); });
    var drop = $("#drop-zone");
    drop.addEventListener("click", function () { $("#audio-file").click(); });
    ["dragover", "dragenter"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = "var(--accent)"; });
    });
    drop.addEventListener("dragleave", function () { drop.style.borderColor = ""; });
    drop.addEventListener("drop", function (e) {
      e.preventDefault(); drop.style.borderColor = "";
      loadFile(e.dataTransfer.files[0]);
    });

    /* ----- 会话持久化：进度刷新不丢 ----- */
    function saveSession() {
      try {
        writeJSON(SESSION_KEY, {
          sessionId: sessionId,
          idx: idx,
          lines: lines.map(function (l) { return { text: l.text, status: l.status }; }),
        });
      } catch (e) {}
    }
    (function restoreSession() {
      var saved = readJSON(SESSION_KEY, null);
      if (saved && saved.lines && saved.lines.length) {
        lines = saved.lines;
        idx = saved.idx || 0;
        sessionId = saved.sessionId || sessionId;
        $("#bench-body").style.display = "";
        $("#file-hint").textContent = "已恢复上次听写进度（" + lines.length + " 句）——音频不会自动恢复，请重新拖入同一段音频继续。";
        renderList();
        showCurrent();
      }
    })();

    $("#load-text").addEventListener("click", function () {
      var raw = $("#transcript").value;
      var next = raw.split("\n").map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; })
        .map(function (s) { return { text: s, status: null }; });
      if (!next.length) { alert("请先粘贴原文，每行一句。"); return; }
      lines = next;
      idx = 0;
      sessionId = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      saveSession();
      renderList();
      showCurrent();
      $("#bench-body").style.display = "";
    });

    $("#speed").addEventListener("change", function () { audio.playbackRate = parseFloat(this.value); });

    function fmt(t) {
      if (t == null) return "--.-";
      return t.toFixed(1) + "s";
    }
    $("#btn-a").addEventListener("click", function () { ptA = audio.currentTime; refreshAB(); });
    $("#btn-b").addEventListener("click", function () { ptB = audio.currentTime; refreshAB(); });
    $("#btn-clear-ab").addEventListener("click", function () { ptA = ptB = null; refreshAB(); });
    function refreshAB() {
      $("#mark-a").textContent = "A: " + fmt(ptA);
      $("#mark-b").textContent = "B: " + fmt(ptB);
    }
    $("#btn-loop").addEventListener("click", function () {
      loopOn = !loopOn;
      this.classList.toggle("primary", loopOn);
      this.textContent = loopOn ? "🔁 循环开" : "🔁 循环关";
    });
    audio.addEventListener("timeupdate", function () {
      if (loopOn && ptA != null && ptB != null && ptB > ptA && audio.currentTime >= ptB) {
        audio.currentTime = ptA;
      }
    });

    function renderList() {
      var box = $("#line-list");
      box.textContent = "";
      lines.forEach(function (l, i) {
        var icon = l.status === "ok" ? "✅" : l.status === "close" ? "🟡" : l.status === "miss" ? "❌" : "·";
        var div = document.createElement("div");
        div.className = "line" + (i === idx ? " current" : "");
        div.textContent = icon + " " + (i + 1) + ". " + (l.status ? l.text : "……");
        if (i === idx) div.style.fontWeight = "700";
        div.addEventListener("click", function () { idx = i; showCurrent(); });
        box.appendChild(div);
      });
      refreshProgress();
    }

    function refreshProgress() {
      var done = lines.filter(function (l) { return l.status; }).length;
      var ok = lines.filter(function (l) { return l.status === "ok"; }).length;
      var close = lines.filter(function (l) { return l.status === "close"; }).length;
      $("#progress").textContent = done + " / " + lines.length + " 句";
      $("#acc").textContent = done ? Math.round((ok + close * 0.5) / done * 100) + "%" : "--";
    }

    function showCurrent() {
      var cur = lines[idx];
      $("#idx-label").textContent = "第 " + (idx + 1) + " / " + lines.length + " 句";
      $("#answer-input").value = "";
      var box = $("#answer-box");
      box.textContent = "";
      var empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "听完后点「对答案」查看原文";
      box.appendChild(empty);
      $("#mark-btns").style.display = "none";
      renderList();
      $("#answer-input").focus();
    }

    function reveal() {
      var cur = lines[idx];
      var box = $("#answer-box");
      box.textContent = "";
      var ans = document.createElement("div");
      ans.className = "answer";
      ans.textContent = cur.text;   // 用户粘贴的原文：只经 textContent 进 DOM，杜绝注入
      box.appendChild(ans);
      $("#mark-btns").style.display = "";
    }
    $("#btn-reveal").addEventListener("click", reveal);
    $("#btn-replay").addEventListener("click", function () {
      if (ptA != null) audio.currentTime = ptA;
      else audio.currentTime = Math.max(0, audio.currentTime - 5);
      audio.play();
    });
    $("#answer-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); reveal(); }
    });
    $("#answer-box").addEventListener("click", function (e) {
      if (e.target.closest(".answer")) reveal();
    });

    /* ----- 句级记录：键 = 会话:句号，重评覆盖，不重复累计 ----- */
    function saveMark(lineIdx, status) {
      var store = readJSON("sia-dictation", {});
      var day = store[todayKey()] || {};
      if (!day.marks) day.marks = {};
      day.marks[sessionId + ":" + lineIdx] = status;
      store[todayKey()] = day;
      writeJSON("sia-dictation", store);
      renderHist();
    }

    function mark(status) {
      if (!lines.length) return;
      lines[idx].status = status;
      saveMark(idx, status);
      saveSession();
      if (idx < lines.length - 1) { idx++; }
      showCurrent();
    }
    $("#m-ok").addEventListener("click", function () { mark("ok"); });
    $("#m-close").addEventListener("click", function () { mark("close"); });
    $("#m-miss").addEventListener("click", function () { mark("miss"); });
    $("#btn-prev").addEventListener("click", function () { if (idx > 0) { idx--; saveSession(); showCurrent(); } });
    $("#btn-next").addEventListener("click", function () { if (idx < lines.length - 1) { idx++; saveSession(); showCurrent(); } });

    function renderHist() {
      var store = readJSON("sia-dictation", {});
      var days = Object.keys(store).sort().slice(-7).reverse();
      var row = $("#hist");
      row.textContent = "";
      days.forEach(function (d) {
        var agg = (SIA.dayAgg || function (s) { return s; })(store[d]);
        var total = agg.ok + agg.close + agg.miss;
        var acc = total ? Math.round((agg.ok + agg.close * 0.5) / total * 100) : 0;
        var cell = document.createElement("div");
        cell.className = "stat";
        var b = document.createElement("b");
        b.textContent = acc + "%";
        var span = document.createElement("span");
        span.textContent = d.slice(5) + " · " + total + " 句";
        cell.appendChild(b);
        cell.appendChild(span);
        row.appendChild(cell);
      });
      if (!days.length) {
        var p = document.createElement("p");
        p.className = "small";
        p.textContent = "完成第一句听写后，这里会出现最近 7 天的正确率。";
        row.appendChild(p);
      }
    }
    renderHist();

    document.addEventListener("keydown", function (e) {
      if (e.target.matches("textarea,input,select")) return;
      if (e.key === " " && audio.src) { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
      if (e.altKey && e.key.toLowerCase() === "q") { e.preventDefault(); $("#btn-a").click(); }
      if (e.altKey && e.key.toLowerCase() === "w") { e.preventDefault(); $("#btn-b").click(); }
    });
  }

  /* ================= ② 口译段落台 ================= */
  var oralAudio = $("#oral-audio");
  if (oralAudio) {
    var oA = null, oB = null;
    var playCount = 0;
    var segments = [];       // { status: null|'pass'|'fail', note: "" }
    var recorder = null, chunks = [];
    var oralSessionId = "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var ORAL_SESSION_KEY = "sia-oral-session";

    function oSaveSession() {
      try {
        writeJSON(ORAL_SESSION_KEY, {
          sessionId: oralSessionId,
          segments: segments,
        });
      } catch (e) {}
    }

    function renderSegs() {
      var box = $("#oline-list");
      if (!segments.length) {
        box.textContent = "载入音频后，每播放一遍计为一段。";
      } else {
        box.textContent = "";
        segments.forEach(function (s, i) {
          var div = document.createElement("div");
          var icon = s.status === "pass" ? "✅" : s.status === "fail" ? "❌" : "⏳";
          div.textContent = icon + " 第 " + (i + 1) + " 遍" + (s.note ? " · " + s.note : "");
          if (i === segments.length - 1) { div.style.fontWeight = "700"; div.style.color = "var(--ink)"; }
          box.appendChild(div);
        });
      }
      var pass = segments.filter(function (s) { return s.status === "pass"; }).length;
      var fail = segments.filter(function (s) { return s.status === "fail"; }).length;
      var done = pass + fail;
      $("#opass").textContent = pass;
      $("#ofail").textContent = fail;
      $("#oratio").textContent = done ? Math.round(pass / done * 100) + "%" : "--";
    }

    // 会话恢复（进度刷新不丢段落与笔记）
    (function oRestore() {
      var saved = readJSON(ORAL_SESSION_KEY, null);
      if (saved && saved.segments && saved.segments.length) {
        segments = saved.segments;
        oralSessionId = saved.sessionId || oralSessionId;
        playCount = segments.length;
        $("#oplay-count").textContent = playCount;
        $("#oral-body").style.display = "";
        $("#oral-empty").style.display = "none";
        $("#oral-hint").textContent = "已恢复上次口译练习（" + segments.length + " 段）——音频不会自动恢复，请重新拖入同一段音频。";
        renderSegs();
      }
    })();

    function oLoad(file) {
      if (!file) return;
      if (oralAudio.src) URL.revokeObjectURL(oralAudio.src);
      oralAudio.src = URL.createObjectURL(file);
      $("#oral-hint").textContent = "🎵 " + file.name;
      $("#oral-body").style.display = "";
      $("#oral-empty").style.display = "none";
      segments = [];
      playCount = 0;
      $("#oplay-count").textContent = "0";
      oralSessionId = "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      oSaveSession();
      renderSegs();
    }
    $("#oral-file").addEventListener("change", function (e) { oLoad(e.target.files[0]); });
    var odrop = $("#oral-drop");
    odrop.addEventListener("click", function () { $("#oral-file").click(); });
    ["dragover", "dragenter"].forEach(function (ev) {
      odrop.addEventListener(ev, function (e) { e.preventDefault(); odrop.style.borderColor = "var(--accent)"; });
    });
    odrop.addEventListener("dragleave", function () { odrop.style.borderColor = ""; });
    odrop.addEventListener("drop", function (e) {
      e.preventDefault(); odrop.style.borderColor = "";
      oLoad(e.dataTransfer.files[0]);
    });

    $("#ospeed").addEventListener("change", function () { oralAudio.playbackRate = parseFloat(this.value); });

    $("#obtn-a").addEventListener("click", function () { oA = oralAudio.currentTime; });
    $("#obtn-b").addEventListener("click", function () { oB = oralAudio.currentTime; });
    $("#obtn-clear").addEventListener("click", function () { oA = oB = null; });

    // 模拟考场：从起点（或 A 点）放到终点（或 B 点）自动停，播放一次计一段
    $("#obtn-once").addEventListener("click", function () {
      if (!oralAudio.src) { alert("请先载入音频。"); return; }
      if (oA != null) oralAudio.currentTime = oA;
      playCount++;
      $("#oplay-count").textContent = playCount;
      segments.push({ status: null, note: "" });
      $("#onote").value = "";
      oSaveSession();
      renderSegs();
      oralAudio.play();
    });
    oralAudio.addEventListener("timeupdate", function () {
      var end = oB != null ? oB : oralAudio.duration;
      if (!oralAudio.paused && end && oralAudio.currentTime >= end) {
        oralAudio.pause();
        $("#onote").focus();
      }
    });

    // 录音（本地 Blob，不上传；提供下载）
    $("#obtn-rec").addEventListener("click", function () {
      if (recorder && recorder.state === "recording") {
        recorder.stop();
        return;
      }
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        alert("当前浏览器不支持录音，请用 Chrome / Edge / Safari 最新版。");
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var mime = recorder.mimeType || "audio/webm";
          var blob = new Blob(chunks, { type: mime });
          var url = URL.createObjectURL(blob);
          var box = $("#orec-playback");
          box.textContent = "";
          var hint = document.createElement("p");
          hint.className = "small";
          hint.style.margin = "6px 0 4px";
          hint.textContent = "🎙 你的口译录音（先回放原音，再听自己这段）：";
          var player = document.createElement("audio");
          player.controls = true;
          player.style.width = "100%";
          player.src = url;
          var dl = document.createElement("a");
          dl.href = url;
          dl.download = "口译录音-" + todayKey() + "-" + String(segments.length).padStart(2, "0") +
            (mime.indexOf("mp4") >= 0 ? ".m4a" : ".webm");
          dl.textContent = "⬇️ 下载本段录音";
          dl.style.display = "inline-block";
          dl.style.marginTop = "6px";
          box.appendChild(hint);
          box.appendChild(player);
          box.appendChild(dl);
          $("#obtn-rec").textContent = "🎙 开始录音";
          $("#orec-hint").textContent = "已生成录音，仅存在本机，可下载备份";
        };
        recorder.start();
        $("#obtn-rec").textContent = "⏹ 停止录音";
        $("#orec-hint").textContent = "● 录音中——译完点停止";
      }).catch(function () {
        $("#orec-hint").textContent = "无法访问麦克风，请检查浏览器权限";
      });
    });

    /* ----- 段级记录：键 = 会话:段号，重评覆盖，不重复累计 ----- */
    function saveSegMark(segIdx, status) {
      var store = readJSON("sia-oral", {});
      var day = store[todayKey()] || {};
      if (!day.marks) day.marks = {};
      day.marks[oralSessionId + ":" + segIdx] = status;
      store[todayKey()] = day;
      writeJSON("sia-oral", store);
    }

    function markSeg(status) {
      if (!segments.length) { alert("先播放一遍再标记。"); return; }
      var i = segments.length - 1;
      segments[i].status = status;
      segments[i].note = $("#onote").value.trim();
      saveSegMark(i, status);
      oSaveSession();
      renderSegs();
    }
    $("#omark-pass").addEventListener("click", function () { markSeg("pass"); });
    $("#omark-fail").addEventListener("click", function () { markSeg("fail"); });
    $("#onext").addEventListener("click", function () { $("#obtn-once").click(); });
  }
})();
