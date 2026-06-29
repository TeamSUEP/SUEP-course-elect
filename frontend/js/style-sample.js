(function () {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    targetInput: $("#input-target"),
    targetTime: $("#target-time"),
    timeOffset: $("#time-offset"),
    localTrigger: $("#local-trigger"),
    countdownMain: $("#countdown-main"),
    countdownMs: $("#countdown-ms"),
    btnSync: $("#btn-sync"),
    btnStart: $("#btn-start"),
    btnStop: $("#btn-stop"),
    terminal: $("#terminal"),
    btnClearLog: $("#btn-clear-log"),
  };

  let offsetMs = 0;
  let timerId = null;
  let targetDate = null;

  function pad(n, len = 2) {
    return String(n).padStart(len, "0");
  }

  function formatDateTime(d) {
    const y = d.getFullYear();
    const mo = pad(d.getMonth() + 1);
    const da = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
  }

  function formatLocalInput(d) {
    const y = d.getFullYear();
    const mo = pad(d.getMonth() + 1);
    const da = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${y}-${mo}-${da}T${h}:${mi}`;
  }

  function addLog(message, type = "info") {
    const now = new Date();
    const time = `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
    const line = document.createElement("div");
    line.className = "terminal-line";
    const spanTime = document.createElement("span");
    spanTime.className = "terminal-time";
    spanTime.textContent = time;
    const spanMsg = document.createElement("span");
    spanMsg.className = `terminal-${type}`;
    spanMsg.textContent = message;
    line.append(spanTime, spanMsg);
    els.terminal.appendChild(line);
    els.terminal.scrollTop = els.terminal.scrollHeight;
  }

  function updateOffsetDisplay() {
    const sign = offsetMs >= 0 ? "+" : "";
    els.timeOffset.textContent = `${sign}${(offsetMs / 1000).toFixed(2)}s`;
  }

  function updateCountdown() {
    if (!targetDate) return;
    const now = Date.now();
    const triggerLocal = targetDate.getTime() - offsetMs;
    let diff = triggerLocal - now;
    if (diff < 0) diff = 0;

    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const ms = diff % 1000;

    els.countdownMain.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    els.countdownMs.textContent = `.${pad(ms, 3)}`;

    if (diff === 0 && timerId) {
      clearInterval(timerId);
      timerId = null;
      addLog("倒计时结束，任务已触发", "success");
    }
  }

  function syncTime() {
    // 模拟服务器对时：产生 -0.20s ~ +0.20s 的偏移
    offsetMs = (Math.random() * 400 - 200);
    updateOffsetDisplay();
    if (targetDate) {
      const triggerLocal = new Date(targetDate.getTime() - offsetMs);
      els.localTrigger.textContent = formatDateTime(triggerLocal);
    }
    addLog(`服务器时间同步完成，偏移 ${(offsetMs / 1000).toFixed(2)}s`, "success");
  }

  function startCountdown() {
    if (!els.targetInput.value) {
      addLog("请先设定目标时间", "error");
      return;
    }
    targetDate = new Date(els.targetInput.value);
    if (isNaN(targetDate.getTime())) {
      addLog("目标时间格式错误", "error");
      return;
    }

    els.targetTime.textContent = formatDateTime(targetDate);
    const triggerLocal = new Date(targetDate.getTime() - offsetMs);
    els.localTrigger.textContent = formatDateTime(triggerLocal);

    if (timerId) clearInterval(timerId);
    updateCountdown();
    timerId = setInterval(updateCountdown, 50);
    addLog(`定时任务已启动，预计本地触发时间: ${formatDateTime(triggerLocal)}`, "info");
  }

  function stopCountdown() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      addLog("倒计时已停止", "warn");
    }
  }

  // Initialize target time to 5 minutes later
  const initDate = new Date(Date.now() + 5 * 60 * 1000);
  els.targetInput.value = formatLocalInput(initDate);
  targetDate = initDate;
  els.targetTime.textContent = formatDateTime(initDate);
  els.localTrigger.textContent = formatDateTime(initDate);
  updateOffsetDisplay();

  els.btnSync.addEventListener("click", syncTime);
  els.btnStart.addEventListener("click", startCountdown);
  els.btnStop.addEventListener("click", stopCountdown);
  els.btnClearLog.addEventListener("click", () => {
    els.terminal.innerHTML = "";
    addLog("日志已清空", "info");
  });

  // Demo: log some interactions from buttons
  document.querySelectorAll(".btn-primary").forEach((btn) => {
    if (btn.id === "btn-start") return;
    btn.addEventListener("click", () => addLog(`执行: ${btn.textContent.trim()}`, "info"));
  });
})();
