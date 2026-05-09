'use strict';

const ODDS = [2, 3, 4, 5, 6, 10, 100, 1000];
const STORAGE_KEY = 'rndstorm-v1';

class RndstormApp {
  constructor() {
    this.isRolling = false;
    this.deferredPrompt = null;

    const saved = this.loadData();
    this.stats   = saved.stats;
    this.history = [];
    this.currentOdds = ODDS.includes(saved.lastOdds) ? saved.lastOdds : 6;

    this.buildOddsPills();
    this.bindEvents();
    this.applyOddsToUI(this.currentOdds);
    this.updateStats();
    this.registerServiceWorker();
    this.setupInstallPrompt();
    this.handleURLParams();

    // Roll immediately so the display is never blank on launch
    setTimeout(() => this.roll(), 120);
  }

  // ── Persistence ────────────────────────────────────────

  loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return {
          stats:    { total: d.stats?.total ?? 0 },
          lastOdds: d.lastOdds ?? 6,
        };
      }
    } catch {}
    return { stats: { total: 0 }, lastOdds: 6 };
  }

  saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        stats:    this.stats,
        lastOdds: this.currentOdds,
      }));
    } catch {}
  }

  // ── Build UI ───────────────────────────────────────────

  buildOddsPills() {
    const container = document.querySelector('.odds-pills');
    [...ODDS, 'custom'].forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'odds-pill';
      btn.dataset.odds = n;
      btn.textContent = n === 'custom' ? 'Custom' : `1 in ${n}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.addEventListener('click', () => this.selectOdds(n));
      container.appendChild(btn);
    });
  }

  // ── Odds Selection ─────────────────────────────────────

  selectOdds(n) {
    if (n === 'custom') {
      document.getElementById('custom-panel').classList.remove('hidden');
      document.getElementById('custom-input').focus();
      this.setActivePill('custom');
      return;
    }
    document.getElementById('custom-panel').classList.add('hidden');
    this.currentOdds = n;
    this.saveData();
    this.applyOddsToUI(n);
    this.roll();
  }

  applyOddsToUI(n) {
    this.setActivePill(n);
  }

  setActivePill(val) {
    document.querySelectorAll('.odds-pill').forEach(pill => {
      const match = String(pill.dataset.odds) === String(val);
      pill.classList.toggle('active', match);
      pill.setAttribute('aria-checked', match ? 'true' : 'false');
    });
  }

  applyCustomOdds() {
    const input = document.getElementById('custom-input');
    const val = parseInt(input.value.trim(), 10);

    if (!val || val < 2) {
      input.classList.add('error');
      setTimeout(() => input.classList.remove('error'), 400);
      input.focus();
      return;
    }

    const clamped = Math.min(val, 999999999);
    input.value = clamped;
    this.currentOdds = clamped;
    this.saveData();
    document.getElementById('custom-panel').classList.add('hidden');
    this.setActivePill('custom');
    this.roll();
  }

  clearResult() {
    const el = document.getElementById('result-number');
    el.className = 'result-number idle';
    el.textContent = '—';
    document.getElementById('result-context').textContent = '';
  }

  // ── Rolling ────────────────────────────────────────────

  roll() {
    if (this.isRolling || !this.currentOdds) return;
    this.isRolling = true;

    const n         = this.currentOdds;
    const numberEl  = document.getElementById('result-number');
    const contextEl = document.getElementById('result-context');
    const rollBtn   = document.getElementById('roll-btn');

    rollBtn.disabled = true;
    rollBtn.classList.add('rolling');
    numberEl.className = 'result-number shuffling';
    contextEl.textContent = '';

    const STEPS = 12;
    let step = 0;

    const tick = () => {
      numberEl.textContent = Math.ceil(Math.random() * n);
      step++;

      if (step < STEPS) {
        const progress = step / STEPS;
        const delay = progress < 0.55
          ? 40
          : 40 + Math.pow((progress - 0.55) / 0.45, 2) * 250;
        setTimeout(tick, delay);
      } else {
        this.settle(n, numberEl, contextEl, rollBtn);
      }
    };

    tick();
  }

  settle(n, numberEl, contextEl, rollBtn) {
    const result = Math.ceil(Math.random() * n);

    numberEl.className = 'result-number reveal';
    numberEl.textContent = result;
    setTimeout(() => {
      numberEl.className = 'result-number';
    }, 300);

    contextEl.textContent = `1 in ${n}`;

    if ('vibrate' in navigator) navigator.vibrate(30);

    this.stats.total++;
    this.saveData();
    this.updateStats();

    this.history.unshift({ result, odds: n });
    if (this.history.length > 30) this.history.pop();
    this.updateHistory();

    rollBtn.disabled = false;
    rollBtn.classList.remove('rolling');
    this.isRolling = false;
  }

  // ── Stats ──────────────────────────────────────────────

  updateStats() {
    document.getElementById('stat-total').textContent = this.stats.total;
  }

  // ── History ────────────────────────────────────────────

  updateHistory() {
    const list  = document.getElementById('history-list');
    const badge = document.getElementById('history-count');
    badge.textContent = this.history.length;
    list.innerHTML = '';

    this.history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.setAttribute('role', 'listitem');
      el.innerHTML = `
        <span class="history-item-number">${item.result}</span>
        <span class="history-item-odds">1 in ${item.odds}</span>
      `;
      list.appendChild(el);
    });
  }

  // ── Events ─────────────────────────────────────────────

  bindEvents() {
    document.getElementById('roll-btn').addEventListener('click', () => this.roll());

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !['INPUT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        this.roll();
      }
    });

    document.getElementById('custom-apply').addEventListener('click', () => this.applyCustomOdds());
    document.getElementById('custom-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.applyCustomOdds();
    });

    document.getElementById('reset-stats').addEventListener('click', () => {
      if (confirm('Reset roll count and history?')) {
        this.stats = { total: 0 };
        this.history = [];
        this.saveData();
        this.updateStats();
        this.updateHistory();
        this.clearResult();
      }
    });

    const historySection = document.querySelector('.history-section');
    document.getElementById('history-toggle').addEventListener('click', () => {
      const open = historySection.classList.toggle('open');
      document.getElementById('history-toggle').setAttribute('aria-expanded', String(open));
    });

    document.getElementById('install-btn').addEventListener('click', () => {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then(({ outcome }) => {
        if (outcome === 'accepted') document.getElementById('install-btn').classList.add('hidden');
        this.deferredPrompt = null;
      });
    });
  }

  // ── PWA ────────────────────────────────────────────────

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      document.getElementById('install-btn').classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('install-btn').classList.add('hidden');
      this.deferredPrompt = null;
    });
  }

  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }

  // ── URL Shortcuts ──────────────────────────────────────

  handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    const oddsParam = params.get('odds');
    if (!oddsParam) return;
    const n = parseInt(oddsParam, 10);
    if (n >= 2 && n <= 999999999) {
      if (ODDS.includes(n)) {
        this.selectOdds(n);
      } else {
        this.currentOdds = n;
        document.getElementById('custom-input').value = n;
        this.setActivePill('custom');
        this.saveData();
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new RndstormApp();
});
