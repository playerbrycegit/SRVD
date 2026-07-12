'use strict';
/* Station web app. Vanilla JS, hash router, no framework (Stage 4 §2). Scope: Auth + Home + Tools
   + Vault exactly as approved in the Master Blueprint - nothing from Stages 12-15. */

const { register, login, logout, isAuthenticated } = window.STATION_API;
const CALC = window.STATION_CALC;
const app = document.getElementById('app');

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
function fmtMoney(n) { return '$' + (Math.round((n || 0) * 100) / 100).toFixed(2); }
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--gold);color:#0B0B0D;font-family:"Space Mono",monospace;font-size:11px;letter-spacing:1px;padding:12px 20px;border-radius:2px;opacity:0;transition:opacity .25s;z-index:200;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.style.opacity = '0'), 1800);
}

// ---------- Router ----------
const PUBLIC_ROUTES = ['#/welcome', '#/login', '#/register'];

function navigate(hash) { window.location.hash = hash; }

async function render() {
  const hash = window.location.hash || '#/welcome';
  const authed = isAuthenticated();

  // Stage 9 §11: navigation guard - protected routes require a session, auth routes redirect away if already in
  if (!authed && !PUBLIC_ROUTES.includes(hash)) return navigate('#/welcome');
  if (authed && PUBLIC_ROUTES.includes(hash)) return navigate('#/home');

  app.innerHTML = '';
  if (hash === '#/welcome') return app.appendChild(renderWelcome());
  if (hash === '#/login') return app.appendChild(renderLogin());
  if (hash === '#/register') return app.appendChild(renderRegister());
  if (hash === '#/home') return app.appendChild(await renderShell('home'));
  if (hash === '#/tools') return app.appendChild(await renderShell('tools'));
  if (hash === '#/vault') return app.appendChild(await renderShell('vault'));
  navigate('#/home');
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// ---------- Auth screens (Stage 7 specs) ----------
function renderWelcome() {
  return h(`
    <div style="max-width:360px;margin:80px auto;text-align:center;">
      <div class="display" style="font-size:22px;">STATION</div>
      <div class="mono" style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin-bottom:24px;">Bartender OS</div>
      <p style="color:var(--text-dim);margin-bottom:32px;">The professional operating system for bartenders.</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <button class="primary" onclick="navigate('#/register')">Create Account</button>
        <button class="ghost" onclick="navigate('#/login')">Log In</button>
      </div>
    </div>
  `);
}

function renderLogin() {
  const frag = h(`
    <div style="max-width:360px;margin:80px auto;">
      <div class="display" style="font-size:20px;text-align:center;margin-bottom:24px;">Log In</div>
      <div id="login-error" role="alert" class="error-text" style="display:none;"></div>
      <div class="field"><label for="login-email">Email</label><input id="login-email" type="email" autocomplete="email"></div>
      <div class="field"><label for="login-password">Password</label><input id="login-password" type="password" autocomplete="current-password"></div>
      <button class="primary" id="login-btn" style="width:100%;">Log In</button>
      <p style="text-align:center;margin-top:20px;color:var(--text-dim);font-size:13px;">
        Don't have an account? <a href="#/register" style="color:var(--gold);">Create account</a>
      </p>
    </div>
  `);
  frag.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    try {
      await login(email, password);
      navigate('#/home');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });
  return frag;
}

function renderRegister() {
  const frag = h(`
    <div style="max-width:360px;margin:80px auto;">
      <div class="display" style="font-size:20px;text-align:center;margin-bottom:24px;">Create Account</div>
      <div id="reg-error" role="alert" class="error-text" style="display:none;"></div>
      <div class="field"><label for="reg-email">Email</label><input id="reg-email" type="email" autocomplete="email"></div>
      <div class="field"><label for="reg-password">Password</label><input id="reg-password" type="password" autocomplete="new-password"></div>
      <button class="primary" id="reg-btn" style="width:100%;">Create Account</button>
      <p style="text-align:center;margin-top:20px;color:var(--text-dim);font-size:13px;">
        Already have an account? <a href="#/login" style="color:var(--gold);">Log in</a>
      </p>
    </div>
  `);
  frag.getElementById('reg-btn').addEventListener('click', async () => {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('reg-error');
    errEl.style.display = 'none';
    try {
      await register(email, password);
      // Foundation-phase simplification, documented in README: login proceeds immediately after
      // registration rather than gating on email verification (Stage 4 §6 specs verification but
      // full email delivery infra isn't part of this offline foundation build).
      await login(email, password);
      navigate('#/home');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });
  return frag;
}

// ---------- Authenticated shell ----------
async function renderShell(activeTab) {
  const frag = h(`
    <header style="border-bottom:1px solid var(--border);padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
      <div class="display" style="font-size:18px;">STATION</div>
      <nav style="display:flex;gap:4px;">
        <button class="tab-btn ghost" data-tab="home">Home</button>
        <button class="tab-btn ghost" data-tab="tools">Tools</button>
        <button class="tab-btn ghost" data-tab="vault">Vault</button>
        <button class="ghost" id="logout-btn">Log Out</button>
      </nav>
    </header>
    <main style="max-width:1040px;margin:0 auto;padding:32px 24px;" id="tab-content"></main>
  `);
  frag.querySelectorAll('.tab-btn').forEach((btn) => {
    if (btn.dataset.tab === activeTab) btn.style.color = 'var(--gold)';
    btn.addEventListener('click', () => navigate('#/' + btn.dataset.tab));
  });
  frag.getElementById('logout-btn').addEventListener('click', async () => {
    await logout();
    navigate('#/welcome');
  });

  const content = frag.getElementById('tab-content');
  if (activeTab === 'home') content.appendChild(await renderHome());
  if (activeTab === 'tools') content.appendChild(renderTools());
  if (activeTab === 'vault') content.appendChild(await renderVault());
  return frag;
}

// ---------- Home (Stage 3 §3 Dashboard) ----------
async function renderHome() {
  let shifts = [], stats = { lifetimeTotal: 0, avgPerShift: 0, bestShift: 0 }, goal = null;
  try {
    shifts = await window.STATION_API.request('/shifts');
    stats = await window.STATION_API.request('/shifts/stats');
    goal = await window.STATION_API.request('/goals');
  } catch (err) { toast(err.message); }

  const frag = h(`
    <div class="display" style="font-size:28px;margin-bottom:24px;">Tonight's <em style="color:var(--gold);font-style:italic;">numbers</em>.</div>
    <div class="card" style="margin-bottom:20px;">
      <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:14px;">LOG A SHIFT</div>
      <div class="field"><label>Date</label><input id="s-date" type="date"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Cash Tips</label><input id="s-cash" type="number" step="0.01" inputmode="decimal"></div>
        <div class="field"><label>Card Tips</label><input id="s-card" type="number" step="0.01" inputmode="decimal"></div>
      </div>
      <button class="primary" id="save-shift">Save Shift</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;">
      <div class="card"><div class="display" style="font-size:26px;">${fmtMoney(stats.lifetimeTotal)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);">LIFETIME</div></div>
      <div class="card"><div class="display" style="font-size:26px;">${fmtMoney(stats.avgPerShift)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);">AVG / SHIFT</div></div>
      <div class="card"><div class="display" style="font-size:26px;">${fmtMoney(stats.bestShift)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);">BEST SHIFT</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px;">WEEKLY GOAL</div>
      <div class="field"><input id="goal-input" type="number" placeholder="1200" value="${goal ? goal.target_amount : ''}"></div>
      <button class="ghost" id="set-goal">Set Goal</button>
    </div>
    <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px;">SHIFT HISTORY</div>
    <div id="shift-list">${shifts.length === 0
      ? '<div style="text-align:center;padding:40px;color:var(--text-faint);font-family:\'Space Mono\',monospace;font-size:11px;border:1px dashed var(--border);">No shifts logged yet.</div>'
      : shifts.map((s) => `
        <div class="card" style="display:flex;justify-content:space-between;margin-bottom:10px;border-top:2px dashed var(--border-2);">
          <div><div class="mono" style="font-size:11px;color:var(--gold);">${s.shift_date}</div></div>
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="display" style="font-size:18px;">${fmtMoney(s.cash_tips + s.card_tips)}</div>
            <button class="ghost" data-delete="${s.id}" style="padding:4px 10px;min-height:auto;">×</button>
          </div>
        </div>
      `).join('')}</div>
  `);

  frag.getElementById('s-date').valueAsDate = new Date();
  frag.getElementById('save-shift').addEventListener('click', async () => {
    try {
      await window.STATION_API.request('/shifts', {
        method: 'POST',
        body: {
          shift_date: document.getElementById('s-date').value,
          cash_tips: Number(document.getElementById('s-cash').value) || 0,
          card_tips: Number(document.getElementById('s-card').value) || 0,
        },
      });
      toast('Shift saved');
      render();
    } catch (err) { toast(err.message); }
  });
  frag.getElementById('set-goal').addEventListener('click', async () => {
    try {
      await window.STATION_API.request('/goals', { method: 'POST', body: { target_amount: Number(document.getElementById('goal-input').value) } });
      toast('Goal set');
      render();
    } catch (err) { toast(err.message); }
  });
  frag.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await window.STATION_API.request(`/shifts/${btn.dataset.delete}`, { method: 'DELETE' }); toast('Shift deleted'); render(); }
      catch (err) { toast(err.message); }
    });
  });
  return frag;
}

// ---------- Tools (Stage 3 §3, Stage 4 §10/§16 - client-side, real shared calc engine) ----------
function renderTools() {
  const frag = h(`
    <div class="display" style="font-size:28px;margin-bottom:24px;">Professional <em style="color:var(--gold);font-style:italic;">calculators</em>.</div>
    <div class="card">
      <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:14px;">BATCH SCALING</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Base Servings</label><input id="b-base" type="number" value="1"></div>
        <div class="field"><label>Target Servings</label><input id="b-target" type="number" value="12"></div>
      </div>
      <div class="field"><label>Ingredient Amount (oz)</label><input id="b-amount" type="number" step="0.01" value="2"></div>
      <button class="primary" id="b-calc">Scale Recipe</button>
      <div id="b-result" class="display" style="font-size:20px;margin-top:14px;color:var(--gold);"></div>
    </div>
    <div class="card" style="margin-top:20px;">
      <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:14px;">ABV / PROOF</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Volume (oz)</label><input id="a-vol" type="number" step="0.01" value="2"></div>
        <div class="field"><label>ABV %</label><input id="a-abv" type="number" step="0.1" value="40"></div>
      </div>
      <button class="primary" id="a-calc">Calculate</button>
      <div id="a-result" class="display" style="font-size:20px;margin-top:14px;color:var(--gold);"></div>
    </div>
    <div class="card" style="margin-top:20px;">
      <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:14px;">UNIT CONVERTER</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="field"><label>Amount</label><input id="c-amt" type="number" value="1"></div>
        <div class="field"><label>From</label><select id="c-from"><option value="oz">oz</option><option value="ml">ml</option></select></div>
        <div class="field"><label>To</label><select id="c-to"><option value="ml">ml</option><option value="oz">oz</option></select></div>
      </div>
      <button class="primary" id="c-calc">Convert</button>
      <div id="c-result" class="display" style="font-size:20px;margin-top:14px;color:var(--gold);"></div>
    </div>
  `);

  frag.getElementById('b-calc').addEventListener('click', () => {
    try {
      const out = CALC.scaleBatch({
        baseServings: Number(document.getElementById('b-base').value),
        targetServings: Number(document.getElementById('b-target').value),
        ingredients: [{ name: 'Ingredient', amount: Number(document.getElementById('b-amount').value) }],
      });
      document.getElementById('b-result').textContent = `${out[0].scaledAmount} oz`;
    } catch (err) { toast(err.message); }
  });
  frag.getElementById('a-calc').addEventListener('click', () => {
    try {
      const out = CALC.calculateAbv({ ingredients: [{ volumeOz: Number(document.getElementById('a-vol').value), abvPercent: Number(document.getElementById('a-abv').value) }] });
      document.getElementById('a-result').textContent = `${out.finalAbvPercent}% ABV · ${out.proof} proof`;
    } catch (err) { toast(err.message); }
  });
  frag.getElementById('c-calc').addEventListener('click', () => {
    try {
      const out = CALC.convertUnit({ amount: Number(document.getElementById('c-amt').value), fromUnit: document.getElementById('c-from').value, toUnit: document.getElementById('c-to').value });
      document.getElementById('c-result').textContent = `${out} ${document.getElementById('c-to').value}`;
    } catch (err) { toast(err.message); }
  });
  return frag;
}

// ---------- Vault (Stage 3 §3) ----------
async function renderVault() {
  let recipes = [];
  try { recipes = await window.STATION_API.request('/recipes'); } catch (err) { toast(err.message); }

  const frag = h(`
    <div class="display" style="font-size:28px;margin-bottom:24px;">Recipe <em style="color:var(--gold);font-style:italic;">vault</em>.</div>
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;align-items:start;">
      <div>
        <div id="recipe-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
          ${recipes.length === 0
            ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-faint);font-family:\'Space Mono\',monospace;font-size:11px;border:1px dashed var(--border);">Build your vault.</div>'
            : recipes.map((r) => `
              <div class="card"><div class="mono" style="font-size:9px;color:var(--gold-dim);">${r.category}</div>
                <div class="display" style="font-size:18px;margin:6px 0;">${r.name}</div>
                <button class="ghost" data-delete-recipe="${r.id}" style="font-size:9px;">Remove</button>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);margin-bottom:14px;">NEW RECIPE</div>
        <div class="field"><label>Name</label><input id="r-name"></div>
        <div class="field"><label>Category</label>
          <select id="r-category"><option>Classic</option><option>Original</option><option>Stirred</option><option>Shaken</option><option>Built</option><option>Batch</option></select>
        </div>
        <div class="field"><label>Ingredient</label><input id="r-ing" placeholder="e.g. 2 oz Bourbon"></div>
        <button class="primary" id="save-recipe" style="width:100%;">Save to Vault</button>
      </div>
    </div>
  `);

  frag.getElementById('save-recipe').addEventListener('click', async () => {
    try {
      await window.STATION_API.request('/recipes', {
        method: 'POST',
        body: {
          name: document.getElementById('r-name').value,
          category: document.getElementById('r-category').value,
          ingredients: [{ ingredient_name: document.getElementById('r-ing').value || 'Ingredient' }],
        },
      });
      toast('Recipe added to vault');
      render();
    } catch (err) { toast(err.message); }
  });
  frag.querySelectorAll('[data-delete-recipe]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try { await window.STATION_API.request(`/recipes/${btn.dataset.deleteRecipe}`, { method: 'DELETE' }); toast('Recipe removed'); render(); }
      catch (err) { toast(err.message); }
    });
  });
  return frag;
}

window.navigate = navigate;
