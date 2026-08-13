/**
 * SERVD Connect beta UI.
 * Kept in a separate module so the existing V1 app shell remains stable. Messaging is preview-only
 * until a real provider and compliance workflow are configured and verified.
 */

function connectEsc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function installConnectNav() {
  const observer = new MutationObserver(() => {
    const nav = document.querySelector('header nav');
    if (!nav || nav.querySelector('[data-connect-nav]')) return;
    const logout = nav.querySelector('#logout-btn');
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.dataset.connectNav = 'true';
    btn.textContent = 'Connect';
    btn.setAttribute('aria-label', 'Open SERVD Connect');
    btn.addEventListener('click', () => navigate('/connect'));
    if (window.location.hash.startsWith('#/connect')) {
      btn.style.color = 'var(--gold)';
      btn.style.borderColor = 'var(--border-2)';
    }
    nav.insertBefore(btn, logout || null);
  });
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
}
installConnectNav();

route('/connect', async () => {
  const [guests, venues, lists] = await Promise.all([api.listGuests(), api.listVenues(), api.listGuestLists()]);
  let selectedGuest = null;
  let activePanel = 'guests';

  const content = h(`
    <div>
      <div class="mono" style="font-size:10px;letter-spacing:3px;color:var(--gold-dim);text-transform:uppercase;margin-bottom:8px;">SERVD Connect</div>
      <h1 class="display" style="font-size:32px;font-weight:500;margin-bottom:10px;">Your personal <em style="color:var(--gold);font-style:italic;">regulars</em>.</h1>
      <p style="max-width:720px;color:var(--text-dim);margin-bottom:28px;">Remember guests, track visits, organize your following, and communicate only with people who have explicitly opted in.</p>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;">
        <button class="ghost" data-connect-panel="guests">Guests</button>
        <button class="ghost" data-connect-panel="lists">Lists</button>
        <button class="ghost" data-connect-panel="messages">Message Preview</button>
      </div>

      <div id="connect-panel"></div>
    </div>
  `);

  function panel() { return content.querySelector('#connect-panel'); }

  function setPanel(name) {
    activePanel = name;
    content.querySelectorAll('[data-connect-panel]').forEach((b) => {
      b.style.color = b.dataset.connectPanel === name ? 'var(--gold)' : '';
      b.style.borderColor = b.dataset.connectPanel === name ? 'var(--border-2)' : '';
    });
    if (name === 'guests') renderGuests();
    if (name === 'lists') renderLists();
    if (name === 'messages') renderMessages();
  }

  async function refreshGuests(search = '') {
    const refreshed = await api.listGuests(search ? { search } : {});
    guests.splice(0, guests.length, ...refreshed);
  }

  function guestCard(g) {
    const badges = [g.is_favorite ? 'Favorite' : '', g.is_regular ? 'Regular' : '', g.is_vip ? 'VIP' : ''].filter(Boolean);
    return `
      <button class="card" data-guest-id="${connectEsc(g.id)}" style="text-align:left;width:100%;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;">
          <div>
            <div class="display" style="font-size:19px;">${connectEsc(g.display_name)}</div>
            <div class="mono" style="font-size:9px;color:var(--text-faint);margin-top:5px;">${connectEsc(g.email || g.phone || 'No contact method')}</div>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">${badges.map((b) => `<span class="mono" style="font-size:8px;color:var(--gold);border:1px solid var(--border-2);padding:4px 6px;border-radius:20px;">${b}</span>`).join('')}</div>
        </div>
      </button>`;
  }

  function renderGuests() {
    panel().innerHTML = `
      <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.8fr);gap:20px;align-items:start;">
        <section>
          <div style="display:flex;gap:10px;margin-bottom:16px;">
            <input id="connect-search" placeholder="Search guests..." aria-label="Search guests">
          </div>
          <div id="guest-list" style="display:grid;gap:10px;">
            ${guests.length ? guests.map(guestCard).join('') : `<div class="card" style="text-align:center;color:var(--text-faint);">No guests yet. Add the first regular on the right.</div>`}
          </div>
        </section>
        <aside class="card" id="connect-editor">
          <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:16px;">Add Guest</div>
          <div id="connect-guest-error" role="alert" class="error-text"></div>
          <div class="field"><label for="cg-name">Name</label><input id="cg-name" placeholder="Jordan Miles"></div>
          <div class="field"><label for="cg-phone">Phone</label><input id="cg-phone" type="tel" placeholder="Optional"></div>
          <div class="field"><label for="cg-email">Email</label><input id="cg-email" type="email" placeholder="Optional"></div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 16px;">
            <label><input id="cg-fav" type="checkbox"> Favorite</label>
            <label><input id="cg-reg" type="checkbox"> Regular</label>
            <label><input id="cg-vip" type="checkbox"> VIP</label>
          </div>
          <button class="primary" id="cg-save" style="width:100%;">Add Guest</button>
          <div id="selected-guest" style="margin-top:22px;"></div>
        </aside>
      </div>`;

    const search = panel().querySelector('#connect-search');
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { await refreshGuests(search.value); renderGuests(); }, 200);
    });

    panel().querySelectorAll('[data-guest-id]').forEach((el) => el.addEventListener('click', async () => {
      selectedGuest = await api.getGuest(el.dataset.guestId);
      renderSelectedGuest();
    }));

    panel().querySelector('#cg-save').addEventListener('click', async () => {
      const error = panel().querySelector('#connect-guest-error');
      error.textContent = '';
      try {
        await api.createGuest({
          displayName: panel().querySelector('#cg-name').value,
          phone: panel().querySelector('#cg-phone').value,
          email: panel().querySelector('#cg-email').value,
          isFavorite: panel().querySelector('#cg-fav').checked,
          isRegular: panel().querySelector('#cg-reg').checked,
          isVip: panel().querySelector('#cg-vip').checked,
        });
        toast('Guest added');
        await refreshGuests();
        renderGuests();
      } catch (err) { error.textContent = err.message; }
    });
  }

  async function renderSelectedGuest() {
    const slot = panel().querySelector('#selected-guest');
    if (!slot || !selectedGuest) return;
    const visits = await api.listGuestVisits(selectedGuest.id);
    slot.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:18px;">
        <div class="display" style="font-size:20px;margin-bottom:4px;">${connectEsc(selectedGuest.display_name)}</div>
        <div class="mono" style="font-size:9px;color:var(--text-faint);margin-bottom:14px;">${visits.length} recorded visit${visits.length === 1 ? '' : 's'}</div>
        <div class="field"><label for="cv-drink">Drink / visit note</label><input id="cv-drink" placeholder="Old Fashioned, celebration, etc."></div>
        <div class="field"><label for="cv-venue">Venue</label><select id="cv-venue"><option value="">No venue</option>${venues.map((v) => `<option value="${connectEsc(v.id)}">${connectEsc(v.name)}</option>`).join('')}</select></div>
        <button class="ghost" id="cv-save" style="width:100%;">Log Visit</button>
        <div style="margin-top:14px;display:grid;gap:7px;">${visits.slice(0, 4).map((v) => `<div style="font-size:12px;color:var(--text-dim);border-left:2px solid var(--gold-dim);padding-left:10px;">${new Date(v.visited_at).toLocaleDateString()} — ${connectEsc(v.drinks || v.occasion || 'Visit')}</div>`).join('')}</div>
      </div>`;
    slot.querySelector('#cv-save').addEventListener('click', async () => {
      await api.logGuestVisit(selectedGuest.id, { venueId: slot.querySelector('#cv-venue').value || null, drinks: slot.querySelector('#cv-drink').value || null });
      toast('Visit logged');
      renderSelectedGuest();
    });
  }

  function renderLists() {
    panel().innerHTML = `
      <div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:20px;align-items:start;">
        <section style="display:grid;gap:10px;">
          ${lists.length ? lists.map((l) => `<div class="card"><div class="display" style="font-size:19px;">${connectEsc(l.name)}</div><div class="mono" style="font-size:9px;color:var(--text-faint);margin-top:5px;">${connectEsc(l.list_type.toUpperCase())}</div></div>`).join('') : `<div class="card" style="color:var(--text-faint);text-align:center;">No lists yet.</div>`}
        </section>
        <aside class="card">
          <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--text-dim);text-transform:uppercase;margin-bottom:16px;">Create List</div>
          <div class="field"><label for="cl-name">List Name</label><input id="cl-name" placeholder="Favorites"></div>
          <div class="field"><label for="cl-kind">Type</label><select id="cl-kind"><option value="manual">Manual</option><option value="favorites">Smart — Favorites</option><option value="regulars">Smart — Regulars</option><option value="recent">Smart — Recent Visitors</option></select></div>
          <button class="primary" id="cl-save" style="width:100%;">Create List</button>
        </aside>
      </div>`;
    panel().querySelector('#cl-save').addEventListener('click', async () => {
      const kind = panel().querySelector('#cl-kind').value;
      const input = { name: panel().querySelector('#cl-name').value };
      if (kind !== 'manual') {
        input.listType = 'smart';
        input.ruleJson = JSON.stringify(kind === 'recent' ? { type: 'recent_visitors', days: 30 } : { type: kind });
      }
      await api.createGuestList(input);
      toast('List created');
      render();
    });
  }

  function renderMessages() {
    const eligibleGuests = guests.filter((g) => g.email || g.phone);
    panel().innerHTML = `
      <div class="card" style="max-width:760px;">
        <div class="mono" style="font-size:10px;letter-spacing:2px;color:var(--gold-dim);text-transform:uppercase;margin-bottom:8px;">Safe Send Preview</div>
        <h2 class="display" style="font-size:24px;margin-bottom:8px;">Who can receive this?</h2>
        <p style="color:var(--text-dim);font-size:13px;margin-bottom:20px;">Beta messaging is intentionally preview-only. SRVD will not send until a real provider, unsubscribe handling, quiet hours, and compliance configuration are verified.</p>
        <div class="field"><label for="cm-channel">Channel</label><select id="cm-channel"><option value="email">Email</option><option value="sms">SMS</option></select></div>
        <div style="max-height:280px;overflow:auto;border:1px solid var(--border);padding:10px;margin-bottom:16px;">
          ${eligibleGuests.length ? eligibleGuests.map((g) => `<label style="display:flex;gap:10px;align-items:center;padding:8px;"><input type="checkbox" data-message-guest="${connectEsc(g.id)}"> <span>${connectEsc(g.display_name)}</span></label>`).join('') : `<div style="color:var(--text-faint);">Add guests with contact details first.</div>`}
        </div>
        <button class="primary" id="cm-preview">Preview Eligibility</button>
        <div id="cm-results" aria-live="polite" style="margin-top:18px;"></div>
      </div>`;
    panel().querySelector('#cm-preview').addEventListener('click', async () => {
      const guestIds = [...panel().querySelectorAll('[data-message-guest]:checked')].map((el) => el.dataset.messageGuest);
      const channel = panel().querySelector('#cm-channel').value;
      const out = await api.previewMessageRecipients({ guestIds, channel, consentType: 'general_updates' });
      panel().querySelector('#cm-results').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
          <div class="card"><div class="display" style="font-size:24px;">${out.selected}</div><div class="mono" style="font-size:8px;color:var(--text-faint);">SELECTED</div></div>
          <div class="card"><div class="display" style="font-size:24px;color:var(--gold);">${out.eligible}</div><div class="mono" style="font-size:8px;color:var(--text-faint);">ELIGIBLE</div></div>
          <div class="card"><div class="display" style="font-size:24px;">${out.excluded}</div><div class="mono" style="font-size:8px;color:var(--text-faint);">EXCLUDED</div></div>
        </div>
        ${out.recipients.map((r) => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;"><span>${connectEsc(guests.find((g) => g.id === r.guestId)?.display_name || 'Guest')}</span><span class="mono" style="font-size:9px;color:${r.eligible ? 'var(--gold)' : 'var(--text-faint)'};">${connectEsc(r.status)}</span></div>`).join('')}`;
    });
  }

  content.querySelectorAll('[data-connect-panel]').forEach((b) => b.addEventListener('click', () => setPanel(b.dataset.connectPanel)));
  setPanel(activePanel);
  return shell('connect', content);
});

// app.js renders before this module loads. Re-render only when Connect was the requested initial route.
if (window.location.hash.startsWith('#/connect')) render();
