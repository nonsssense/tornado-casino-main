/**
 * LEGACY APPLICATION — preserved during architecture migration.
 *
 * This monolithic file contains the current working UI (menu, dice, refer, etc.).
 * Do not extend with new features — implement in static/src/ modules instead.
 * Remove this file once all screens are migrated to pages/, games/, and overlays/.
 */
(() => {
  const root = document.getElementById('page_content');

  const tg = window.Telegram?.WebApp;
  const telegram = {
    initData: null,
    user: null,
    telegramId: null,
  };
  if (tg) {
    tg.ready();

    tg.expand();

    telegram.initData = tg.initData;

    telegram.user = tg.initDataUnsafe?.user ?? null;

    telegram.telegramId = telegram.user?.id ?? null;

    console.log('Telegram User:', telegram.user);
    console.log('Telegram ID:', telegram.telegramId);
    console.log('InitData:', telegram.initData);
  } else {
    console.warn('Telegram WebApp not found');
  }

  if (!root) {
    console.error('Missing #page_content');
    return;
  }

  const state = {
    page: 'menu',
    telegram: {
      telegram_id: telegram.telegramId,
      user: telegram.user,
    },
    profile: {
      username: 'V',
      balance: 24860,
      avatar: 'V',
    },
    refer: {
      total_earnings: 0,
      total_referrals: 0,
      active_referrals: 0,
      commission_rate: '5%',
      referral_link: 'https://t.me/your_bot?start=ref123',
      chart_points: [12, 18, 10, 24, 20, 30, 22],
    },
  };

  function money(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(num);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }

  function navButton(label, key, active = false) {
    return `<button class="nav-btn ${active ? 'active' : ''}" data-nav="${key}">${label}</button>`;
  }

  function gameCard(label, icon, key, wide = false) {
    return `
      <button class="game-card glass-panel ${wide ? 'blackjack-card' : ''}" data-game="${key}">
        <span class="game-icon">${icon}</span>
        <span class="game-label">${label}</span>
      </button>
    `;
  }

  function menuPage() {
    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="profile">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>

        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>

        <button class="settings-btn" data-nav="settings">⚙</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Weekly bonus</p>
          <h2>VIP Tournament</h2>
        </div>
        <button class="bonus-action" data-action="claim-bonus">Claim</button>
      </section>

      <section class="games-grid">
        ${gameCard('Dice', '⚀', 'dice')}
        ${gameCard('Roulette', '◌', 'roulette')}
        ${gameCard('Crash', '⬢', 'crash')}
        ${gameCard('Coin Flip', '◌', 'coinflip')}
        ${gameCard('Blackjack', '♠', 'blackjack', true)}
      </section>
    `;
  }

  function referPage() {
    const points = state.refer.chart_points
      .map((n) => `<span style="height:${Math.max(12, n * 3)}px"></span>`)
      .join('');

    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="menu">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>

        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>

        <button class="settings-btn" data-nav="settings">⚙</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Referral program</p>
          <h2>Invite & Earn</h2>
        </div>
        <button class="bonus-action" data-action="copy-link">Copy</button>
      </section>

      <section class="glass-panel" style="padding:16px; margin-bottom:14px;">
        <div class="wallet-top" style="margin-bottom:10px;">
          <span>Total earned</span>
          <strong>${money(state.refer.total_earnings)}</strong>
        </div>

        <div class="quick-actions" style="margin-bottom:12px;">
          <button class="action-btn active">Referrals: ${state.refer.total_referrals}</button>
          <button class="action-btn active">Active: ${state.refer.active_referrals}</button>
          <button class="action-btn active">Commission: ${state.refer.commission_rate}</button>
        </div>

        <div style="display:flex; align-items:end; gap:6px; height:96px; margin-bottom:14px;">
          ${points}
        </div>

        <div style="padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:18px; margin-bottom:12px;">
          <small style="display:block; color:var(--muted); margin-bottom:6px;">Your referral link</small>
          <div style="word-break:break-all; font-weight:600;">${state.refer.referral_link}</div>
        </div>

        <div style="padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:18px;">
          <small style="display:block; color:var(--muted); margin-bottom:6px;">Partnership</small>
          <div style="color:var(--text); line-height:1.5;">
            Level 1 — 5%<br>
            Level 2 — 2%<br>
            Level 3 — 1%<br><br>
            Share your link and earn from your invited players.
          </div>
        </div>
      </section>
    `;
  }

  function sportPage() {
    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="menu">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>
        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>
        <button class="settings-btn" data-nav="settings">⚙</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Sports</p>
          <h2>Coming Soon</h2>
        </div>
      </section>
    `;
  }

  function stakePage() {
    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="menu">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>
        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>
        <button class="settings-btn" data-nav="settings">⚙</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Stake</p>
          <h2>Coming Soon</h2>
        </div>
      </section>
    `;
  }

  function dicePage() {
    return `
    <header class="topbar">
      <button class="profile-btn" data-nav="menu">
        <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
      </button>

      <div class="balance-pill">
        <span class="token-icon">◌</span>
        <span class="balance-value">${money(state.profile.balance)}</span>
      </div>

      <button class="settings-btn" data-nav="settings">⚙</button>
    </header>

    <section class="bonus-banner glass-panel">
      <div>
        <p class="eyebrow">Game</p>
        <h2>Dice</h2>
      </div>
      <button class="bonus-action" data-action="back-menu">Back</button>
    </section>

    <section class="glass-panel" style="padding:16px;">
      <div style="margin-bottom:12px;">
        <label style="display:block; color:var(--muted); margin-bottom:8px;">Bet amount</label>
        <input id="dice-bet" type="number" value="10" min="1"
               style="width:100%; padding:14px; border-radius:16px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); color:var(--text);" />
      </div>

      <div style="margin-bottom:12px;">
        <label style="display:block; color:var(--muted); margin-bottom:8px;">Target number</label>
        <input id="dice-limit" type="number" value="50" min="1" max="98"
               style="width:100%; padding:14px; border-radius:16px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.04); color:var(--text);" />
      </div>

      <div class="dice-mode">

      <button class="action-btn active" id="dice-over-btn" type="button">
        OVER
        <small>Roll above target</small>
      </button>

      <button class="action-btn" id="dice-under-btn" type="button">
        UNDER
        <small>Roll below target</small>
      </button>

    </div>

    <div class="dice-info glass-panel">

      <div class="dice-info-row">
        <span>Win Chance</span>
        <strong id="chance-value">49%</strong>
      </div>

      <div class="dice-info-row">
        <span>Payout</span>
        <strong id="factor-value">1.95x</strong>
      </div>

      <div class="dice-info-row">
        <span>Profit</span>
        <strong id="profit-value">$9.50</strong>
      </div>

      <div class="dice-rule" id="dice-rule">
        Roll must be ABOVE 50
      </div>

    </div>

    <button class="bonus-action roll-btn" data-action="roll-dice">
      ROLL
    </button>

    <div id="dice-result" class="result-card">
      Waiting for roll...
    </div>
    </section>
  `;
  }

  function comingSoonPage(title) {
    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="menu">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>
        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>
        <button class="settings-btn" data-nav="settings">⚙</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Game</p>
          <h2>${title}</h2>
        </div>
        <button class="bonus-action" data-action="back-menu">Back</button>
      </section>

      <section class="glass-panel" style="padding:16px;">
        <p style="color:var(--muted);">Coming soon.</p>
      </section>
    `;
  }

  function settingsPage() {
    return `
      <header class="topbar">
        <button class="profile-btn" data-nav="menu">
          <span class="profile-avatar">${state.profile.avatar || 'V'}</span>
        </button>
        <div class="balance-pill">
          <span class="token-icon">◌</span>
          <span class="balance-value">${money(state.profile.balance)}</span>
        </div>
        <button class="settings-btn" data-nav="menu">✕</button>
      </header>

      <section class="bonus-banner glass-panel">
        <div>
          <p class="eyebrow">Settings</p>
          <h2>Coming Soon</h2>
        </div>
      </section>
    `;
  }

  function pageTemplate(page) {
    switch (page) {
      case 'menu':
        return menuPage();
      case 'refer':
        return referPage();
      case 'sport':
        return sportPage();
      case 'stake':
        return stakePage();
      case 'dice':
        return dicePage();
      case 'roulette':
        return comingSoonPage('Roulette');
      case 'crash':
        return comingSoonPage('Crash');
      case 'blackjack':
        return comingSoonPage('Blackjack');
      case 'settings':
        return settingsPage();
      default:
        return menuPage();
    }
  }

  function render(page = 'menu') {
    state.page = page;
    root.innerHTML = pageTemplate(page);
    if (page === 'dice') {
      updateDiceInfo();
      document.getElementById('dice-bet')?.addEventListener('input', updateDiceInfo);

      document.getElementById('dice-limit')?.addEventListener('input', updateDiceInfo);
    }
    setActiveNav(page);
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === page);
    });
  }

  async function loadProfile() {
    try {
      const data = await api('/api/profile');
      state.profile = { ...state.profile, ...data };
    } catch (error) {
      console.warn('profile fetch failed, using fallback:', error.message);
    }
  }

  async function loadRefer() {
    try {
      const data = await api('/api/referrals/summary');
      state.refer = { ...state.refer, ...data };
    } catch (error) {
      console.warn('refer fetch failed, using fallback:', error.message);
    }
  }

  async function claimBonus() {
    try {
      await api('/api/bonus/claim', { method: 'POST' });
      alert('Bonus claimed');
    } catch (error) {
      alert('Bonus is not ready yet');
    }
  }

  async function rollDice() {
    const betInput = document.getElementById('dice-bet');
    const limitInput = document.getElementById('dice-limit');
    const resultBox = document.getElementById('dice-result');
    const overBtn = document.getElementById('dice-over-btn');
    const underBtn = document.getElementById('dice-under-btn');

    if (!betInput || !limitInput || !resultBox || !overBtn || !underBtn) return;

    const bid = Number(betInput.value || 0);
    const limit = Number(limitInput.value || 0);
    const over = overBtn.classList.contains('active');

    try {
      const data = await api('/api/games/rolldice', {
        method: 'POST',
        body: JSON.stringify({
          bid,
          limit,
          over,
        }),
      });

      if (typeof data.payout === 'number') {
        state.profile.balance += data.payout;
        document.querySelector('.balance-value').textContent = money(state.profile.balance);
      }

      resultBox.innerHTML = `
        Result: <strong>${data.result ? 'WIN' : 'LOSE'}</strong><br>
        Payout: <strong>${money(data.payout || 0)}</strong><br>
        Balance: <strong>${money(state.profile.balance)}</strong>
      `;
    } catch (error) {
      resultBox.textContent = 'Dice endpoint is not ready yet.';
    }
  }

  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      const page = nav.dataset.nav;
      if (page === 'profile' || page === 'menu') {
        render('menu');
        return;
      }
      if (page === 'settings') {
        render('settings');
        return;
      }
      render(page);
      return;
    }

    const game = event.target.closest('[data-game]');
    if (game) {
      render(game.dataset.game);
      return;
    }

    const overBtn = event.target.closest('#dice-over-btn');
    const underBtn = event.target.closest('#dice-under-btn');

    if (overBtn || underBtn) {
      const overButton = document.getElementById('dice-over-btn');
      const underButton = document.getElementById('dice-under-btn');

      if (!overButton || !underButton) return;

      if (overBtn) {
        overButton.classList.add('active');
        underButton.classList.remove('active');
      } else {
        underButton.classList.add('active');
        overButton.classList.remove('active');
      }

      updateDiceInfo();

      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;

    const type = action.dataset.action;

    if (type === 'back-menu') {
      render('menu');
      return;
    }

    if (type === 'claim-bonus') {
      await claimBonus();
      return;
    }

    if (type === 'copy-link') {
      try {
        await navigator.clipboard.writeText(state.refer.referral_link);
        alert('Link copied');
      } catch {
        alert(state.refer.referral_link);
      }
      return;
    }

    if (type === 'roll-dice') {
      await rollDice();
      return;
    }

    if (type === 'bet-plus' || type === 'bet-minus') {
      const input = document.getElementById('dice-bet');
      const value = Number(action.dataset.value || 0);
      if (!input) return;

      const current = Number(input.value || 0);
      input.value = type === 'bet-plus' ? current + value : Math.max(1, current - value);
      return;
    }
  });

  async function init() {
    if (telegram.initData) {
      try {
        const auth = await api('/api/auth', {
          method: 'POST',
          body: JSON.stringify({
            initdata: telegram.initData,
          }),
        });

        console.log('AUTH RESPONSE:', auth);
      } catch (e) {
        console.error('Telegram auth failed:', e);
      }
    }

    await Promise.all([loadProfile(), loadRefer()]);

    render('menu');
  }

  init();

  function updateDiceInfo() {
    const bid = Number(document.getElementById('dice-bet').value);

    const limit = Number(document.getElementById('dice-limit').value);

    const over = document.getElementById('dice-over-btn').classList.contains('active');

    let chance;

    if (over) {
      chance = 99 - limit;
    } else {
      chance = limit;
    }

    const factor = 97.5 / chance;

    const profit = bid * factor - bid;

    document.getElementById('chance-value').textContent = `${chance}%`;

    document.getElementById('factor-value').textContent = `${factor.toFixed(2)}x`;

    document.getElementById('profit-value').textContent = `$${profit.toFixed(2)}`;

    document.getElementById('dice-rule').textContent = over
      ? `Roll must be ABOVE ${limit}`
      : `Roll must be BELOW ${limit}`;
  }
})();
