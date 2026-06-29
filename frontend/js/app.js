(function () {
  // State
  let elections = {}; // name -> id
  let electionNames = {}; // id -> name
  let activeElectionId = null;
  let electionState = {}; // id -> { courses, selectedCourse, query, loaded }
  let configLoaded = false;
  let saveTimer = null;

  // DOM helpers
  const $ = (sel) => document.querySelector(sel);

  function addLog(level, message, time) {
    const terminal = $("#terminal");
    if (!terminal) return;
    const now = time ? new Date(time) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timeStr = `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
      now.getSeconds()
    )}]`;
    const line = document.createElement("div");
    line.className = "terminal-line";
    const spanTime = document.createElement("span");
    spanTime.className = "terminal-time";
    spanTime.textContent = timeStr;
    const spanMsg = document.createElement("span");
    spanMsg.className = `terminal-${level}`;
    spanMsg.textContent = message;
    line.append(spanTime, spanMsg);
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
  }

  function updateLoginStatus(me) {
    const dot = $("#status-dot");
    const text = $("#status-text");
    const badge = $("#login-badge");
    if (me.logged_in) {
      dot.classList.remove("offline");
      text.textContent = me.username || "已登录";
      badge.className = "badge badge-green";
      badge.textContent = "已登录";
    } else {
      dot.classList.add("offline");
      text.textContent = "未登录";
      badge.className = "badge badge-red";
      badge.textContent = "未登录";
    }
  }

  function updateDemoUI(enabled) {
    const badge = $("#demo-badge");
    const btn = $("#btn-demo-toggle");
    if (enabled) {
      badge.classList.remove("hidden");
      btn.textContent = "关闭 Demo 模式";
      btn.classList.add("btn-orange");
      btn.classList.remove("btn-ghost");
    } else {
      badge.classList.add("hidden");
      btn.textContent = "开启 Demo 模式";
      btn.classList.remove("btn-orange");
      btn.classList.add("btn-ghost");
    }
  }

  async function toggleDemo() {
    const current = $("#demo-badge").classList.contains("hidden");
    const next = current;
    try {
      await API.setDemo(next);
      updateDemoUI(next);
      addLog("info", `Demo 模式已${next ? "开启" : "关闭"}`);
      // Refresh elections; clear course cache
      electionState = {};
      activeElectionId = null;
      renderElectionTabs();
      renderCourses();
      $("#btn-add-course-node").disabled = true;
      await loadElections();
    } catch (e) {
      addLog("error", "设置 Demo 模式失败: " + e.message);
    }
  }

  async function loadMe() {
    try {
      const me = await API.me();
      updateLoginStatus(me);
      if (me.username && !($("#username").value || "").trim()) {
        $("#username").value = me.username;
      }
    } catch (e) {
      addLog("error", "获取登录状态失败: " + e.message);
    }
  }

  async function loadConfig() {
    try {
      const cfg = await API.config();
      if (cfg.interval !== undefined) $("#interval").value = cfg.interval;
      if (cfg.threads_interval !== undefined)
        $("#threads-interval").value = cfg.threads_interval;
      if (cfg.max_retries !== undefined)
        $("#max-retries").value = cfg.max_retries;
      if (cfg.target_server_time) {
        const d = new Date(cfg.target_server_time);
        if (!isNaN(d.getTime())) {
          Countdown.els.input.value = Countdown.formatLocalInput(d);
          Countdown.setTarget(d);
        }
      }
      if (cfg.tasks && cfg.tasks.length > 0) {
        TreeController.importTasks(cfg.tasks);
      }
      configLoaded = true;
      // Try to restore active election from config
      if (cfg.election_id && electionNames[cfg.election_id]) {
        activeElectionId = cfg.election_id;
        renderElectionTabs();
        await switchElection(cfg.election_id, false);
      }
    } catch (e) {
      console.error("load config failed", e);
    }
  }

  async function loadElections() {
    try {
      elections = await API.elections();
      electionNames = Object.fromEntries(
        Object.entries(elections).map(([name, id]) => [id, name])
      );
      renderElectionTabs();
      if (activeElectionId && !electionNames[activeElectionId]) {
        activeElectionId = null;
      }
      if (!activeElectionId && Object.keys(elections).length > 0) {
        activeElectionId = Object.values(elections)[0];
      }
      renderElectionTabs();
      if (activeElectionId) {
        await switchElection(activeElectionId, false);
      }
      addLog("success", `已加载 ${Object.keys(elections).length} 个选课批次`);
    } catch (e) {
      addLog("error", "获取选课批次失败: " + e.message);
    }
  }

  function renderElectionTabs() {
    const tabs = $("#election-tabs");
    tabs.innerHTML = "";
    const names = Object.keys(elections);
    if (names.length === 0) {
      tabs.innerHTML = '<div class="text-muted">暂无批次，请先刷新</div>';
      return;
    }
    names.forEach((name) => {
      const id = elections[name];
      const btn = document.createElement("button");
      btn.className = "election-tab" + (id === activeElectionId ? " active" : "");
      btn.textContent = name;
      btn.onclick = () => switchElection(id, true);
      tabs.appendChild(btn);
    });
  }

  async function switchElection(electionId, forceRefresh) {
    activeElectionId = electionId;
    renderElectionTabs();
    const state = getElectionState(electionId);
    $("#course-search").value = state.query || "";
    if (!state.loaded || forceRefresh) {
      await loadCourses(electionId);
    } else {
      renderCourses();
    }
  }

  function getElectionState(electionId) {
    if (!electionState[electionId]) {
      electionState[electionId] = {
        courses: [],
        selectedCourse: null,
        query: "",
        loaded: false,
      };
    }
    return electionState[electionId];
  }

  async function loadCourses(electionId) {
    if (!electionId) return;
    const state = getElectionState(electionId);
    state.loaded = false;
    renderCourses();
    try {
      const check = $("#check-availability").checked;
      state.courses = await API.courses(electionId, check);
      state.selectedCourse = null;
      state.loaded = true;
      if (activeElectionId === electionId) {
        renderCourses();
        addLog(
          "success",
          `[${electionNames[electionId] || electionId}] 已加载 ${state.courses.length} 门课程`
        );
      }
    } catch (e) {
      addLog("error", "加载课程失败: " + e.message);
      if (activeElectionId === electionId) renderCourses();
    }
  }

  function renderCourses() {
    const tbody = $("#course-tbody");
    if (!activeElectionId) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-muted" style="text-align:center;">请先选择选课批次</td></tr>';
      $("#btn-add-course-node").disabled = true;
      return;
    }
    const state = getElectionState(activeElectionId);
    const search = (state.query || "").toLowerCase();
    tbody.innerHTML = "";
    if (!state.loaded) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-muted" style="text-align:center;">加载中...</td></tr>';
      $("#btn-add-course-node").disabled = true;
      return;
    }
    const filtered = state.courses.filter((c) => {
      if (!search) return true;
      const text = `${c.id || ""} ${c.no || ""} ${c.name || ""} ${
        c.teachers || ""
      }`.toLowerCase();
      return text.includes(search);
    });
    if (filtered.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-muted" style="text-align:center;">无匹配课程</td></tr>';
      $("#btn-add-course-node").disabled = true;
      return;
    }
    filtered.forEach((c) => {
      const tr = document.createElement("tr");
      if (state.selectedCourse && state.selectedCourse.id === c.id) {
        tr.classList.add("selected");
      }
      const status =
        c.available === true
          ? '<span class="text-green">有容量</span>'
          : c.available === false
          ? '<span class="text-red">已满</span>'
          : '<span class="text-muted">-</span>';
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${c.no || "-"}</td>
        <td>${c.name || "-"}</td>
        <td>${c.teachers || "-"}</td>
        <td>${status}</td>
      `;
      tr.onclick = () => {
        state.selectedCourse = c;
        renderCourses();
        $("#btn-add-course-node").disabled = false;
      };
      tbody.appendChild(tr);
    });
  }

  function addSelectedCourse() {
    if (!activeElectionId) {
      addLog("error", "请先选择选课批次");
      return;
    }
    const state = getElectionState(activeElectionId);
    const course = state.selectedCourse;
    if (!course) return;
    TreeController.addCourse(
      course,
      activeElectionId,
      electionNames[activeElectionId]
    );
    addLog(
      "info",
      `已添加课程: ${course.name || course.id} [${electionNames[activeElectionId]}]`
    );
  }

  function addGroup(op) {
    TreeController.addGroup(op);
    addLog("info", `已添加组合节点: ${op.toUpperCase()}`);
  }

  function clearTasks() {
    TreeController.clear();
    addLog("warn", "已清空任务层级");
  }

  async function syncTime() {
    try {
      $("#btn-sync").disabled = true;
      const result = await API.syncTime();
      Countdown.setOffset(result.offset_ms);
      addLog(
        "success",
        `时间同步完成，偏移 ${(result.offset_ms / 1000).toFixed(2)}s`
      );
    } catch (e) {
      addLog("error", "时间同步失败: " + e.message);
    } finally {
      $("#btn-sync").disabled = false;
    }
  }

  async function startTask() {
    const tasks = TreeController.exportTasks();
    if (tasks.length === 0) {
      addLog("error", "任务层级中没有任务");
      return;
    }
    const interval = parseFloat($("#interval").value) || 5;
    const threadsInterval = parseFloat($("#threads-interval").value) || 0.5;
    const maxRetries = parseInt($("#max-retries").value) || 0;

    let targetStr = null;
    const target = Countdown.getInputTarget();
    if (target && !isNaN(target.getTime())) {
      targetStr = target.toISOString();
    }

    try {
      const payload = {
        election_id: activeElectionId || null,
        target_server_time: targetStr,
        tasks,
        interval,
        threads_interval: threadsInterval,
        max_retries: maxRetries,
      };
      TreeController.clearStatuses();
      const result = await API.start(payload);
      updateTaskStatusUI({ running: true });
      if (result.scheduled && target) {
        Countdown.start(target);
        addLog(
          "info",
          `任务已定时，预计本地触发: ${Countdown.els.localTrigger.textContent}`
        );
      } else {
        addLog("success", "任务已开始");
        Countdown.resetDisplay();
      }
    } catch (e) {
      addLog("error", "启动任务失败: " + e.message);
      pollStatus();
    }
  }

  async function stopTask() {
    try {
      await API.stop();
      Countdown.stop();
      Countdown.resetDisplay();
      addLog("warn", "任务已停止");
      pollStatus();
    } catch (e) {
      addLog("error", "停止任务失败: " + e.message);
    }
  }

  let statusTimer = null;

  function updateTaskStatusUI(status) {
    const running = status && (status.running || status.scheduled);
    $("#btn-start").disabled = running;
    $("#btn-stop").disabled = !running;
  }

  async function pollStatus() {
    try {
      const s = await API.status();
      updateTaskStatusUI(s);
      if (s.statuses) {
        Object.entries(s.statuses).forEach(([taskId, st]) => {
          TreeController.setStatus(taskId, st);
        });
      }
    } catch (e) {
      console.error("status poll failed", e);
    }
  }

  function startStatusPolling() {
    if (statusTimer) return;
    statusTimer = setInterval(pollStatus, 1000);
  }

  async function doLogin() {
    const username = $("#username").value.trim();
    const password = $("#password").value;
    const remember = $("#remember-username").checked;
    if (!username || !password) {
      addLog("error", "请输入学号和密码");
      return;
    }
    $("#btn-login").disabled = true;
    try {
      const result = await API.login(username, password, remember);
      updateLoginStatus({ logged_in: true, username: result.username });
      $("#password").value = "";
      addLog("success", "登录成功");
    } catch (e) {
      addLog("error", "登录失败: " + e.message);
    } finally {
      $("#btn-login").disabled = false;
    }
  }

  async function doLogout() {
    try {
      await API.logout();
      updateLoginStatus({ logged_in: false });
      addLog("warn", "已退出登录");
    } catch (e) {
      addLog("error", "退出失败: " + e.message);
    }
  }

  async function saveConfig() {
    if (!configLoaded) return;
    try {
      const payload = {
        election_id: activeElectionId,
        tasks: TreeController.exportTasks(),
        interval: parseFloat($("#interval").value) || 5,
        threads_interval: parseFloat($("#threads-interval").value) || 0.5,
        max_retries: parseInt($("#max-retries").value) || 0,
        target_server_time: null,
      };
      const target = Countdown.getInputTarget();
      if (target && !isNaN(target.getTime())) {
        payload.target_server_time = target.toISOString();
      }
      await API.post("/config", payload);
    } catch (e) {
      console.error("save config failed", e);
    }
  }

  function scheduleSaveConfig() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 500);
  }

  function init() {
    Countdown.init();

    TreeController.init($("#tree-panel"), [], (tasks) => {
      scheduleSaveConfig();
    });

    // WebSocket logs + status updates
    API.connectWebSocket((data) => {
      addLog(data.level || "info", data.message, data.time);
      if (data.task_id && data.status) {
        TreeController.setStatus(data.task_id, data.status);
      }
    });

    loadMe();
    API.getVerifySsl()
      .then((r) => {
        $("#verify-ssl").checked = r.enabled;
      })
      .catch(() => {});
    API.getDemo()
      .then((r) => updateDemoUI(r.enabled))
      .catch(() => {});
    loadElections().then(() => loadConfig());

    // Event listeners
    $("#btn-demo-toggle").onclick = toggleDemo;
    $("#btn-login").onclick = doLogin;
    $("#btn-logout").onclick = doLogout;
    $("#verify-ssl").onchange = async () => {
      try {
        await API.setVerifySsl($("#verify-ssl").checked);
        addLog(
          "info",
          `SSL 验证已${$("#verify-ssl").checked ? "开启" : "关闭"}`
        );
      } catch (e) {
        addLog("error", "设置 SSL 验证失败: " + e.message);
      }
    };
    $("#btn-refresh-elections").onclick = loadElections;
    $("#btn-add-course-node").onclick = addSelectedCourse;
    $("#course-search").oninput = (e) => {
      if (!activeElectionId) return;
      const state = getElectionState(activeElectionId);
      state.query = e.target.value;
      renderCourses();
    };
    $("#check-availability").onchange = () => {
      if (activeElectionId) loadCourses(activeElectionId);
    };

    $("#btn-sync").onclick = syncTime;
    $("#btn-start").onclick = startTask;
    $("#btn-stop").onclick = stopTask;

    $("#btn-add-all").onclick = () => addGroup("all");
    $("#btn-add-any").onclick = () => addGroup("any");
    $("#btn-add-seq").onclick = () => addGroup("sequence");
    $("#btn-clear-tasks").onclick = clearTasks;
    $("#btn-clear-log").onclick = () => {
      $("#terminal").innerHTML = "";
    };

    // Also save config when params change
    $("#interval").onchange = scheduleSaveConfig;
    $("#threads-interval").onchange = scheduleSaveConfig;
    $("#max-retries").onchange = scheduleSaveConfig;
    Countdown.els.input.onchange = scheduleSaveConfig;

    // Default target time: 5 minutes from now
    const initTarget = new Date(Date.now() + 5 * 60 * 1000);
    Countdown.els.input.value = Countdown.formatLocalInput(initTarget);
    Countdown.setTarget(initTarget);

    startStatusPolling();
    pollStatus();

    addLog("info", "系统初始化完成");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
