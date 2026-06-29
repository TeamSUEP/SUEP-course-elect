(function (global) {
  const Countdown = {
    els: {},
    timer: null,
    targetDate: null,
    offsetMs: 0,
    active: false,

    init() {
      this.els = {
        h: document.getElementById("countdown-h"),
        m: document.getElementById("countdown-m"),
        s: document.getElementById("countdown-s"),
        ms: document.getElementById("countdown-ms"),
        target: document.getElementById("target-time"),
        offset: document.getElementById("time-offset"),
        localTrigger: document.getElementById("local-trigger"),
        input: document.getElementById("input-target"),
      };
    },

    setOffset(ms) {
      this.offsetMs = ms || 0;
      const sign = this.offsetMs >= 0 ? "+" : "";
      this.els.offset.textContent = `${sign}${(this.offsetMs / 1000).toFixed(
        2
      )}s`;
      if (this.targetDate) {
        this.updateLocalTrigger();
      }
    },

    setTarget(d) {
      this.targetDate = d;
      if (d) {
        this.els.target.textContent = this.formatDateTime(d);
        this.updateLocalTrigger();
      } else {
        this.els.target.textContent = "--";
        this.els.localTrigger.textContent = "--";
      }
    },

    updateLocalTrigger() {
      if (!this.targetDate) return;
      const localTrigger = new Date(
        this.targetDate.getTime() - this.offsetMs
      );
      this.els.localTrigger.textContent = this.formatDateTime(localTrigger);
    },

    getInputTarget() {
      const val = this.els.input.value;
      if (!val) return null;
      return new Date(val);
    },

    start(d) {
      if (d) this.setTarget(d);
      if (!this.targetDate) return;
      this.stop();
      this.active = true;
      this.update();
      this.timer = setInterval(() => this.update(), 50);
    },

    stop() {
      this.active = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },

    resetDisplay() {
      this.els.h.textContent = "00";
      this.els.m.textContent = "00";
      this.els.s.textContent = "00";
      this.els.ms.textContent = ".000";
    },

    update() {
      if (!this.targetDate) return;
      const now = Date.now();
      const triggerLocal = this.targetDate.getTime() - this.offsetMs;
      let diff = triggerLocal - now;
      if (diff < 0) diff = 0;

      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const ms = diff % 1000;

      this.els.h.textContent = this.pad(hours);
      this.els.m.textContent = this.pad(minutes);
      this.els.s.textContent = this.pad(seconds);
      this.els.ms.textContent = `.${this.pad(ms, 3)}`;
    },

    pad(n, len = 2) {
      return String(n).padStart(len, "0");
    },

    formatDateTime(d) {
      const y = d.getFullYear();
      const mo = this.pad(d.getMonth() + 1);
      const da = this.pad(d.getDate());
      const h = this.pad(d.getHours());
      const mi = this.pad(d.getMinutes());
      const s = this.pad(d.getSeconds());
      return `${y}-${mo}-${da} ${h}:${mi}:${s}`;
    },

    formatLocalInput(d) {
      const y = d.getFullYear();
      const mo = this.pad(d.getMonth() + 1);
      const da = this.pad(d.getDate());
      const h = this.pad(d.getHours());
      const mi = this.pad(d.getMinutes());
      return `${y}-${mo}-${da}T${h}:${mi}`;
    },
  };

  global.Countdown = Countdown;
})(window);
