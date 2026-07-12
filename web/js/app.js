/**
 * STATION application shell. Hash-based router, no framework (Stage 4 §2). Renders into #app.
 * Screens match Stage 7's UI Build Package specs for the approved V1 scope: Auth, Home, Tools, Vault.
 */
const api = window.STATION_API;
const app = document.getElementById('app');

function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function fmtMoney(n) { return '$' + (Math.round((n || 0) * 100) / 100).toFixed(2); }
function toast(msg) {
  const t = h(`<div class="toast" role="status">${msg}</div>`);
  Object.assign(t.style, { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--gold)', color: '#0B0B0D', padding: '12px 20px', borderRadius: 'var(--radius-default)',
    fontFamily: "'Space Mono',monospace", fontSize: '11px', letterSpacing: '1px', zIndex: 999 });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------------- Router ----------------
const routes = {};
function route(path, handler) { routes[path] = handler; }
function navigate(path) { window.location.hash = path; }
async function render() {
  const hash = window.location.hash.slice(1) || '/';
  const authed = api.isAuthenticated();
  const publicPaths = ['/', '/login', '/register'];
  if (!authed && !publicPaths.includes(hash)) return navigate('/');
  if (authed && publicPaths.includes(hash)) return navigate('/home');

  const handler = routes[hash.split('?')[0]] || routes['/404'];
  app.innerHTML = '';
  try {
    const view = await handler();
    app.appendChild(view);
  } catch (err) {
    app.appendChild(h(`<div class="card" style="max-width:480px;margin:60px auto;">
      <p role="alert" class="error-text">${err.message || 'Something went wrong'}</p>
      <button class="ghost" onclick="window.location.hash='/home'">Back</button>
    </div>`));
  }
}
window.addEventListener('hashchange', render);

// ---------------- Shared nav shell ----------------
function shell(activeTab, contentEl) {
  const wrap = h(`
    <div>
      <header style="position:sticky;top:0;background:rgba(11,11,13,.92);backdrop-filter:blur(10px);
        border-bottom:1px solid var(--border);z-index:50;">
        <div style="max-width:1040px;margin:0 auto;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:baseline;gap:10px;">
            <span class="display" style="font-weight:600;font-size:22px;">STATION</span>
            <span class="mono" style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;">Bartender OS</span>
          </div>
          <nav style="display:flex;gap:4px;">
            <button data-tab="home" class="ghost">Home</button>
            <button data-tab="tools" class="ghost">Tools</button>
            <button data-tab="vault" class="ghost">Vault</button>
            <button id="logout-btn" class="ghost" aria-label="Log out">Logout</button>
          </nav>
        </div>
      </header>
      <main style="max-width:1040px;margin:0 auto;padding:40px 24px;"></main>
    </div>
  `);
  wrap.querySelectorAll('[data-tab]').forEach((btn) => {
    if (btn.dataset.tab === activeTab) { btn.style.color = 'var(--gold)'; btn.style.borderColor = 'var(--border-2)'; }
    btn.addEventListener('click', () => navigate('/' + btn.dataset.tab));
  });
  wrap.querySelector('#logout-btn').addEventListener('click', async () => { await api.logout(); navigate('/'); });
  wrap.querySelector('main').appendChild(contentEl);
  return wrap;
}

// ---------------- Auth screens (Stage 7) ----------------
route('/', () => h(`
  <div style="max-width:360px;margin:80px auto;text-align:center;">
    <div class="display" style="font-size:32px;font-weight:600;">STATION</div>
    <p class="mono" style="font-size:9px;letter-spacing:2.5px;color:var(--gold);text-transform:uppercase;margin:8px 0 24px;">Bartender OS</p>
    <p style="color:var(--text-dim);margin-bottom:32px;">The professional operating system for bartenders.</p>
    <button class="primary" style="width:100%;margin-bottom:10px;" onclick="window.location.hash='/register'">Create Account</button>
    <button class="ghost" style="width:100%;" onclick="window.location.hash='/login'">Log In</button>
  </div>
`));

route('/login', () => {
  const view = h(`
    <div style="max-width:360px;margin:80px auto;">
      <div class="display" style="font-size:26px;margin-bottom:24px;text-align:center;">Log In</div>
      <div id="err" role="alert" class="error-text"></div>
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username"></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password"></div>
      <button class="primary" id="submit" style="width:100%;">Log In</button>
      <p style="text-align:center;margin-top:20px;color:var(--text-dim);font-size:13px;">
        Don't have an account? <a href="#/register" style="color:var(--gold);">Create account</a>
      </p>
    </div>
  `);
  view.querySelector('#submit').addEventListener('click', async () => {
    const email = view.querySelector('#email').value;
    const password = view.querySelector('#password').value;
    try {
      await api.login(email, password);
      navigate('/home');
    } catch (err) {
      view.querySelector('#err').textContent = err.message;
    }
  });
  return view;
});

route('/register', () => {
  const view = h(`
    <div style="max-width:360px;margin:80px auto;">
      <div class="display" style="font-size:26px;margin-bottom:24px;text-align:center;">Create Account</div>
      <div id="err" role="alert" class="error-text"></div>
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username"></div>
      <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="new-password"></div>
      <button class="primary" id="submit" style="width:100%;">Create Account</button>
      <p style="text-align:center;margin-top:20px;color:var(--text-dim);font-size:13px;">
        Already have an account? <a href="#/login" style="color:var(--gold);">Log in</a>
      </p>
    </div>
  `);
  view.querySelector('#submit').addEventListener('click', async () => {
    const email = view.querySelector('#email').value;
    const password = view.querySelector('#password').value;
    try {
      await api.register(email, password);
      // Note: Stage 4 §6 specifies email-verification-gated access; this build logs the user in
      // immediately after registration since no email delivery infra exists in this sandbox -
      // a stated simplification, not a silent omission (see README "Known Limitations").
      await api.login(email, password);
      navigate('/home');
    } catch (err) {
      view.querySelector('#err').textContent = err.message;
    }
  });
  return view;
});

// ---------------- Home (Stage 3 §3, Stage 7) ----------------
route('/home', async () => {
  const [shifts, stats, goal] = await Promise.all([api.listShifts(), api.getStats(), api.getGoalProgress()]);

  const content = h(`
    <div>
      <div class="mono" style="font-size:10px;letter-spacing:3px;color:var(--gold-dim);text-transform:uppercase;margin-bottom:8px;">Daily Workflow</div>
      <h1 class="display" style="font-size:32px;font-weight:500;margin-bottom:32px;">Tonight's <em style="color:var(--gold);font-style:italic;">numbers</em>.</h1>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-bottom:20px;">
        <div class="card">
          <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">Log a Shift</div>
          <div id="shift-err" role="alert" class="error-text"></div>
          <div class="field"><label for="s-date">Date</label><input id="s-date" type="date"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field"><label for="s-cash">Cash Tips ($)</label><input id="s-cash" type="number" step="0.01" min="0"></div>
            <div class="field"><label for="s-card">Card Tips ($)</label><input id="s-card" type="number" step="0.01" min="0"></div>
          </div>
          <button class="primary" id="log-shift">Save Shift</button>
        </div>
        <div class="card">
          <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">Weekly Goal</div>
          <div class="field"><label for="g-target">Target ($ / 7 days)</label><input id="g-target" type="number" step="10" min="0" value="${goal ? goal.target : ''}"></div>
          <button class="ghost" id="set-goal" style="width:100%;margin-bottom:16px;">${goal ? 'Update Goal' : 'Set Goal'}</button>
          <div id="goal-progress"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px;">
        <div class="card" style="border-left:2px solid var(--gold);"><div class="display" style="font-size:30px;">${fmtMoney(stats.lifetimeTotal)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);margin-top:6px;">LIFETIME TIPS</div></div>
        <div class="card" style="border-left:2px solid var(--gold);"><div class="display" style="font-size:30px;">${fmtMoney(stats.avgPerShift)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);margin-top:6px;">AVG / SHIFT</div></div>
        <div class="card" style="border-left:2px solid var(--gold);"><div class="display" style="font-size:30px;">${fmtMoney(stats.bestShift)}</div><div class="mono" style="font-size:9px;color:var(--text-dim);margin-top:6px;">BEST SHIFT</div></div>
      </div>
      <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:14px;">Shift History</div>
      <div id="shift-list"></div>
    </div>
  `);

  function renderGoalProgress(g) {
    const wrap = content.querySelector('#goal-progress');
    if (!g) { wrap.innerHTML = `<div class="mono" style="font-size:11px;color:var(--text-faint);">No goal set yet.</div>`; return; }
    const pct = Math.min(100, g.percent);
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-family:'Space Mono',monospace;font-size:12px;">
        <span style="color:var(--gold);">${fmtMoney(g.current)}</span><span style="color:var(--text-dim);">of ${fmtMoney(g.target)}</span>
      </div>
      <div style="width:100%;height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden;margin-top:10px;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--gold-dim),var(--gold));"></div>
      </div>`;
  }
  renderGoalProgress(goal);

  function renderShiftList(list) {
    const el = content.querySelector('#shift-list');
    if (list.length === 0) { el.innerHTML = `<div class="mono" style="text-align:center;padding:40px;color:var(--text-faint);font-size:11px;border:1px dashed var(--border);">No shifts logged yet. Log tonight's numbers above.</div>`; return; }
    el.innerHTML = list.map((s) => `
      <div class="card" style="border-top:2px dashed var(--border-2);display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:14px 16px;">
        <div><div class="mono" style="font-size:11px;color:var(--gold);">${s.shift_date}</div></div>
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="text-align:right;">
            <div class="display" style="font-size:20px;">${fmtMoney(s.cash_tips + s.card_tips)}</div>
            <div class="mono" style="font-size:9px;color:var(--text-faint);">CASH ${fmtMoney(s.cash_tips)} · CARD ${fmtMoney(s.card_tips)}</div>
          </div>
          <button class="ghost" data-del="${s.id}" aria-label="Delete shift" style="width:32px;height:36px;padding:0;">×</button>
        </div>
      </div>`).join('');
    el.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      await api.deleteShift(btn.dataset.del);
      render();
    }));
  }
  renderShiftList(shifts);

  content.querySelector('#s-date').valueAsDate = new Date();
  content.querySelector('#log-shift').addEventListener('click', async () => {
    const cash = parseFloat(content.querySelector('#s-cash').value) || 0;
    const card = parseFloat(content.querySelector('#s-card').value) || 0;
    const shift_date = content.querySelector('#s-date').value;
    try {
      await api.logShift({ shift_date, cash_tips: cash, card_tips: card });
      toast('Shift saved');
      render();
    } catch (err) { content.querySelector('#shift-err').textContent = err.message; }
  });
  content.querySelector('#set-goal').addEventListener('click', async () => {
    const target = parseFloat(content.querySelector('#g-target').value);
    if (!target) return;
    await api.setGoal({ target_amount: target });
    toast('Goal set');
    render();
  });

  return shell('home', content);
});

// ---------------- Tools (Stage 4 §10, Stage 7) ----------------
route('/tools', () => {
  const content = h(`
    <div>
      <div class="mono" style="font-size:10px;letter-spacing:3px;color:var(--gold-dim);text-transform:uppercase;margin-bottom:8px;">Behind the Bar</div>
      <h1 class="display" style="font-size:32px;font-weight:500;margin-bottom:32px;">Professional <em style="color:var(--gold);font-style:italic;">calculators</em>.</h1>
      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;" id="tool-tabs">
        <button class="ghost" data-tool="batch">Batching</button>
        <button class="ghost" data-tool="abv">ABV / Proof</button>
        <button class="ghost" data-tool="convert">Unit Convert</button>
      </div>
      <div class="card" id="tool-panel"></div>
    </div>
  `);

  function renderBatch() {
    const panel = content.querySelector('#tool-panel');
    panel.innerHTML = `
      <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">Batch Scaling</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label for="b-base">Base Servings</label><input id="b-base" type="number" value="1" min="1"></div>
        <div class="field"><label for="b-target">Target Servings</label><input id="b-target" type="number" value="12" min="1"></div>
      </div>
      <div class="field"><label for="b-name">Ingredient</label><input id="b-name" placeholder="Gin"></div>
      <div class="field"><label for="b-amt">Amount (per base serving)</label><input id="b-amt" type="number" step="0.01" placeholder="2"></div>
      <button class="primary" id="b-calc">Scale Recipe</button>
      <div id="b-out" style="margin-top:16px;" aria-live="polite"></div>`;
    panel.querySelector('#b-calc').addEventListener('click', async () => {
      const baseServings = parseFloat(panel.querySelector('#b-base').value);
      const targetServings = parseFloat(panel.querySelector('#b-target').value);
      const name = panel.querySelector('#b-name').value || 'Ingredient';
      const amount = parseFloat(panel.querySelector('#b-amt').value);
      try {
        const out = await api.calcBatch({ baseServings, targetServings, ingredients: [{ name, amount }] });
        panel.querySelector('#b-out').innerHTML = out.map((r) => `<div class="display" style="font-size:20px;">${r.scaledAmount ?? 'invalid'} — ${r.name}</div>`).join('');
      } catch (err) { toast(err.message); }
    });
  }
  function renderAbv() {
    const panel = content.querySelector('#tool-panel');
    panel.innerHTML = `
      <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">ABV & Dilution</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label for="a-vol">Volume (oz)</label><input id="a-vol" type="number" step="0.01" placeholder="2"></div>
        <div class="field"><label for="a-abv">ABV %</label><input id="a-abv" type="number" step="0.1" placeholder="40"></div>
      </div>
      <div class="field"><label for="a-dil">Dilution (oz, optional)</label><input id="a-dil" type="number" step="0.1" value="0"></div>
      <button class="primary" id="a-calc">Calculate</button>
      <div id="a-out" style="margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;" aria-live="polite"></div>`;
    panel.querySelector('#a-calc').addEventListener('click', async () => {
      const volumeOz = parseFloat(panel.querySelector('#a-vol').value);
      const abvPercent = parseFloat(panel.querySelector('#a-abv').value);
      const dilution = parseFloat(panel.querySelector('#a-dil').value) || 0;
      try {
        const out = await api.calcAbv({ ingredients: [{ volumeOz, abvPercent }], dilution });
        panel.querySelector('#a-out').innerHTML = `
          <div><div class="display" style="font-size:26px;color:var(--gold);">${out.finalAbvPercent}%</div><div class="mono" style="font-size:9px;color:var(--text-dim);">FINAL ABV</div></div>
          <div><div class="display" style="font-size:26px;color:var(--gold);">${out.proof}</div><div class="mono" style="font-size:9px;color:var(--text-dim);">PROOF</div></div>
          <div><div class="display" style="font-size:26px;color:var(--gold);">${out.totalVolumeOz} oz</div><div class="mono" style="font-size:9px;color:var(--text-dim);">TOTAL VOLUME</div></div>`;
      } catch (err) { toast(err.message); }
    });
  }
  function renderConvert() {
    const panel = content.querySelector('#tool-panel');
    panel.innerHTML = `
      <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">Unit Conversion</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div class="field"><label for="c-amt">Amount</label><input id="c-amt" type="number" value="1" step="0.01"></div>
        <div class="field"><label for="c-from">From</label><select id="c-from"><option>oz</option><option>ml</option><option>cl</option><option>tsp</option><option>tbsp</option><option>cup</option><option>l</option></select></div>
        <div class="field"><label for="c-to">To</label><select id="c-to"><option selected>ml</option><option>oz</option><option>cl</option><option>tsp</option><option>tbsp</option><option>cup</option><option>l</option></select></div>
      </div>
      <button class="primary" id="c-calc">Convert</button>
      <div id="c-out" style="margin-top:16px;" aria-live="polite"></div>`;
    panel.querySelector('#c-calc').addEventListener('click', async () => {
      const amount = parseFloat(panel.querySelector('#c-amt').value);
      const fromUnit = panel.querySelector('#c-from').value;
      const toUnit = panel.querySelector('#c-to').value;
      try {
        const { result } = await api.calcConvert({ amount, fromUnit, toUnit });
        panel.querySelector('#c-out').innerHTML = `<div class="display" style="font-size:32px;">${result} ${toUnit}</div>`;
      } catch (err) { toast(err.message); }
    });
  }

  const tools = { batch: renderBatch, abv: renderAbv, convert: renderConvert };
  content.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => {
    content.querySelectorAll('[data-tool]').forEach((b) => b.style.color = '');
    btn.style.color = 'var(--gold)';
    tools[btn.dataset.tool]();
  }));
  renderBatch();
  content.querySelector('[data-tool="batch"]').style.color = 'var(--gold)';

  return shell('tools', content);
});

// ---------------- Vault (Stage 4 §4/§11, Stage 7) ----------------
route('/vault', async () => {
  const recipes = await api.listRecipes();
  const content = h(`
    <div>
      <div class="mono" style="font-size:10px;letter-spacing:3px;color:var(--gold-dim);text-transform:uppercase;margin-bottom:8px;">The Craft</div>
      <h1 class="display" style="font-size:32px;font-weight:500;margin-bottom:32px;">Recipe <em style="color:var(--gold);font-style:italic;">vault</em>.</h1>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;align-items:start;">
        <div>
          <input id="v-search" placeholder="Search recipes..." style="margin-bottom:20px;">
          <div id="v-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;"></div>
        </div>
        <div class="card">
          <div class="mono" style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin-bottom:18px;">New Recipe</div>
          <div id="r-err" role="alert" class="error-text"></div>
          <div class="field"><label for="r-name">Name</label><input id="r-name" placeholder="Black Wolf"></div>
          <div class="field"><label for="r-cat">Category</label>
            <select id="r-cat"><option>Classic</option><option>Original</option><option>Stirred</option><option>Shaken</option><option>Built</option><option>Batch</option></select>
          </div>
          <div class="field"><label for="r-ing">Ingredient</label><input id="r-ing" placeholder="Bourbon, 2 oz"></div>
          <div class="field"><label for="r-method">Method</label><textarea id="r-method"></textarea></div>
          <button class="primary" id="r-save" style="width:100%;">Save to Vault</button>
        </div>
      </div>
    </div>
  `);

  function renderGrid(list) {
    const grid = content.querySelector('#v-grid');
    if (list.length === 0) { grid.innerHTML = `<div class="mono" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-faint);font-size:11px;border:1px dashed var(--border);">Build your vault on the right.</div>`; return; }
    grid.innerHTML = list.map((r) => `
      <div class="card" style="cursor:pointer;" data-open="${r.id}">
        <div class="mono" style="font-size:9px;letter-spacing:1.5px;color:var(--gold-dim);text-transform:uppercase;">${r.category}</div>
        <div class="display" style="font-size:19px;margin:8px 0 6px;">${r.name}</div>
      </div>`).join('');
    grid.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', async () => {
      const r = await api.getRecipe(el.dataset.open);
      alert(`${r.name}\n\n${r.ingredients.map((i) => `${i.amount || ''} ${i.unit || ''} ${i.ingredient_name}`).join('\n')}\n\n${r.method || ''}`);
    }));
  }
  renderGrid(recipes);

  content.querySelector('#v-search').addEventListener('input', async (e) => {
    renderGrid(await api.listRecipes({ search: e.target.value }));
  });
  content.querySelector('#r-save').addEventListener('click', async () => {
    const name = content.querySelector('#r-name').value;
    const category = content.querySelector('#r-cat').value;
    const ingText = content.querySelector('#r-ing').value;
    const method = content.querySelector('#r-method').value;
    try {
      await api.createRecipe({ name, category, method, ingredients: [{ ingredient_name: ingText || 'Ingredient' }] });
      toast('Recipe added to vault');
      render();
    } catch (err) { content.querySelector('#r-err').textContent = err.message; }
  });

  return shell('vault', content);
});

route('/404', () => h(`<div style="text-align:center;margin-top:80px;color:var(--text-dim);">Not found</div>`));

render();
