(function (global) {
  const API = {
    base: "",
    ws: null,

    async request(method, path, body) {
      const opts = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(`${this.base}${path}`, opts);
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail || `HTTP ${resp.status}`);
      }
      return data;
    },

    get(path) {
      return this.request("GET", path);
    },
    post(path, body) {
      return this.request("POST", path, body);
    },

    me() {
      return this.get("/me");
    },
    config() {
      return this.get("/config");
    },
    login(username, password, rememberUsername) {
      return this.post("/login", {
        username,
        password,
        remember_username: rememberUsername,
      });
    },
    logout() {
      return this.post("/logout");
    },
    elections() {
      return this.get("/elections");
    },
    courses(electionId, checkAvailability = true) {
      return this.get(
        `/courses?election_id=${encodeURIComponent(electionId)}&check_availability=${checkAvailability}`
      );
    },
    syncTime() {
      return this.post("/sync-time");
    },
    start(payload) {
      return this.post("/start", payload);
    },
    stop() {
      return this.post("/stop");
    },
    status() {
      return this.get("/status");
    },
    getVerifySsl() {
      return this.get("/verify-ssl");
    },
    setVerifySsl(enabled) {
      return this.post("/verify-ssl", { enabled });
    },
    getDemo() {
      return this.get("/demo");
    },
    setDemo(enabled) {
      return this.post("/demo", { enabled });
    },

    connectWebSocket(onMessage) {
      if (this.ws) {
        try {
          this.ws.close();
        } catch (e) {}
      }
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
      ws.onopen = () => {};
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (onMessage) onMessage(data);
        } catch (e) {
          console.error("WS parse error", e);
        }
      };
      ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(onMessage), 2000);
      };
      ws.onerror = (err) => {
        console.error("WS error", err);
      };
      this.ws = ws;
    },
  };

  global.API = API;
})(window);
