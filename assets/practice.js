/* 训练台：① 逐句听写工作台（笔试听力）② 口译段落台（只放一遍 + 录音 + 及格制自评）
   纯前端，音频与录音数据不出本机。 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  /* ================= ① 听写工作台 ================= */
  var audio = $("#audio");
  if (audio) {
    var lines = [];          // { text, status: null|'ok'|'close'|'miss' }
    var idx = 0;
    var loopOn = false;
    var ptA = null, ptB = null;

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

    $("#load-text").addEventListener("click", function () {
      var raw = $("#transcript").value;
      lines = raw.split("\n").map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; })
        .map(function (s) { return { text: s, status: null }; });
      if (!lines.length) { alert("请先粘贴原文，每行一句。"); return; }
      idx = 0;
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
    audio.addEventListener("play", function () { if ($("#btn-play")) $("#btn-play").textContent = "⏸ 暂停"; });
    audio.addEventListener("pause", function () { if ($("#btn-play")) $("#btn-play").textContent = "▶ 播放"; });

    function renderList() {
      var box = $("#line-list");
      box.innerHTML = "";
      lines.forEach(function (l, i) {
        var icon = l.status === "ok" ? "✅" : l.status === "close" ? "🟡" : l.status === "miss" ? "❌" : "·";
        var div = document.createElement("div");
        div.className = "line" + (i === idx ? " current" : "");
        div.textContent = icon + " " + (i + 1) + ". " + (l.status ? l.text : "……");
        if (i === idx) div.style.fontWeight = "700";
        div.addEventListener("click", function () { idx = i; showCurrent(); });
        box.appendChild(div);
      });
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
      $("#answer-box").innerHTML = '<div class="empty">听完后点「对答案」查看原文（或按 Enter 提交你的听写）</div>';
      $("#mark-btns").style.display = "none";
      renderList();
      $("#answer-input").focus();
    }

    function reveal() {
      var cur = lines[idx];
      $("#answer-box").innerHTML = '<div class="answer">' + cur.text + "</div>";
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
    $("#answer-box").addEventListener("click", reveal);

    function mark(status) {
      lines[idx].status = status;
      saveHistory(status);
      if (idx < lines.length - 1) { idx++; }
      showCurrent();
    }
    $("#m-ok").addEventListener("click", function () { mark("ok"); });
    $("#m-close").addEventListener("click", function () { mark("close"); });
    $("#m-miss").addEventListener("click", function () { mark("miss"); });
    $("#btn-prev").addEventListener("click", function () { if (idx > 0) { idx--; showCurrent(); } });
    $("#btn-next").addEventListener("click", function () { if (idx < lines.length - 1) { idx++; showCurrent(); } });

    function histStore() { try { return JSON.parse(localStorage.getItem("sia-dictation") || "{}"); } catch (e) { return {}; } }
    function saveHistory(status) {
      var store = histStore();
      var k = new Date().toISOString().slice(0, 10);
      var s = store[k] || { ok: 0, close: 0, miss: 0 };
      s[status]++;
      store[k] = s;
      localStorage.setItem("sia-dictation", JSON.stringify(store));
      renderHist();
    }
    function renderHist() {
      var store = histStore();
      var days = Object.keys(store).sort().slice(-7).reverse();
      var html = "";
      days.forEach(function (d) {
        var s = store[d];
        var total = s.ok + s.close + s.miss;
        var acc = total ? Math.round((s.ok + s.close * 0.5) / total * 100) : 0;
        html += '<div class="stat"><b>' + acc + "%</b><span>" + d.slice(5) + " · " + total + " 句</span></div>";
      });
      $("#hist").innerHTML = html || '<p class="small">完成第一句听写后，这里会出现最近 7 天的正确率。</p>';
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

    // 录音（本地 Blob，不上传）
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
          var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          var url = URL.createObjectURL(blob);
          $("#orec-playback").innerHTML =
            '<p class="small" style="margin:6px 0 4px">🎙 你的口译录音（先回放原音，再听自己这段）：</p>' +
            '<audio controls style="width:100%" src="' + url + '"></audio>';
          $("#obtn-rec").textContent = "🎙 开始录音";
          $("#orec-hint").textContent = "已生成录音，仅存在本机";
        };
        recorder.start();
        $("#obtn-rec").textContent = "⏹ 停止录音";
        $("#orec-hint").textContent = "● 录音中——译完点停止";
      }).catch(function () {
        $("#orec-hint").textContent = "无法访问麦克风，请检查浏览器权限";
      });
    });

    function renderSegs() {
      var box = $("#oline-list");
      if (!segments.length) {
        box.innerHTML = "载入音频后，每播放一遍计为一段。";
      } else {
        box.innerHTML = "";
        segments.forEach(function (s, i) {
          var div = document.createElement("div");
          div.textContent = (s.status === "pass" ? "✅" : s.status === "fail" ? "❌" : "⏳") +
            " 第 " + (i + 1) + " 遍" + (s.note ? " · " + s.note : "");
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

    function markSeg(status) {
      if (!segments.length) { alert("先播放一遍再标记。"); return; }
      var cur = segments[segments.length - 1];
      cur.status = status;
      cur.note = $("#onote").value.trim();
      saveDay(status);
      renderSegs();
    }
    $("#omark-pass").addEventListener("click", function () { markSeg("pass"); });
    $("#omark-fail").addEventListener("click", function () { markSeg("fail"); });
    $("#onext").addEventListener("click", function () { $("#obtn-once").click(); });

    function saveDay(status) {
      var store = {};
      try { store = JSON.parse(localStorage.getItem("sia-oral") || "{}"); } catch (e) {}
      var k = new Date().toISOString().slice(0, 10);
      var s = store[k] || { pass: 0, fail: 0 };
      s[status]++;
      store[k] = s;
      localStorage.setItem("sia-oral", JSON.stringify(store));
    }
  }
})();
