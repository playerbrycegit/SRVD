/**
 * API client. Thin fetch wrapper matching the server response envelope.
 */
const API_BASE = window.SRVD_API_BASE ?? '';
const TOKEN_KEY = 'srvd_session_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) clearToken();
    const err = new Error(json?.error?.message || 'Request failed');
    err.field = json?.error?.field || null;
    err.status = res.status;
    throw err;
  }
  return json.devOnly ? { ...json.data, _devOnly: json.devOnly } : json.data;
}

const api = {
  request: apiRequest,
  register: (email, password) => apiRequest('/auth/register', { method: 'POST', body: { email, password } }),
  verifyEmail: (token) => apiRequest('/auth/verify-email', { method: 'POST', body: { token } }),
  requestPasswordReset: (email) => apiRequest('/auth/request-password-reset', { method: 'POST', body: { email } }),
  resetPassword: (token, newPassword) => apiRequest('/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
  login: async (email, password) => {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return data;
  },
  logout: async () => { await apiRequest('/auth/logout', { method: 'POST' }); clearToken(); },
  deleteAccount: (password) => apiRequest('/auth/delete-account', { method: 'POST', body: { password } }),
  isAuthenticated: () => Boolean(getToken()),

  logShift: (input) => apiRequest('/shifts', { method: 'POST', body: input }),
  updateShift: (id, input) => apiRequest(`/shifts/${id}`, { method: 'PATCH', body: input }),
  listShifts: () => apiRequest('/shifts'),
  deleteShift: (id) => apiRequest(`/shifts/${id}`, { method: 'DELETE' }),
  getStats: () => apiRequest('/shifts/stats'),
  setGoal: (input) => apiRequest('/goals', { method: 'POST', body: input }),
  getGoalProgress: () => apiRequest('/goals'),

  createRecipe: (input) => apiRequest('/recipes', { method: 'POST', body: input }),
  updateRecipe: (id, input) => apiRequest(`/recipes/${id}`, { method: 'PATCH', body: input }),
  listRecipes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/recipes${qs ? '?' + qs : ''}`);
  },
  getRecipe: (id) => apiRequest(`/recipes/${id}`),
  deleteRecipe: (id) => apiRequest(`/recipes/${id}`, { method: 'DELETE' }),

  calcBatch: (input) => apiRequest('/tools/batch', { method: 'POST', body: input }),
  calcAbv: (input) => apiRequest('/tools/abv', { method: 'POST', body: input }),
  calcConvert: (input) => apiRequest('/tools/convert', { method: 'POST', body: input }),

  // SERVD Connect
  createVenue: (input) => apiRequest('/connect/venues', { method: 'POST', body: input }),
  listVenues: () => apiRequest('/connect/venues'),
  createGuest: (input) => apiRequest('/connect/guests', { method: 'POST', body: input }),
  listGuests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/connect/guests${qs ? '?' + qs : ''}`);
  },
  getGuest: (id) => apiRequest(`/connect/guests/${id}`),
  updateGuest: (id, input) => apiRequest(`/connect/guests/${id}`, { method: 'PATCH', body: input }),
  archiveGuest: (id) => apiRequest(`/connect/guests/${id}`, { method: 'DELETE' }),
  logGuestVisit: (guestId, input) => apiRequest(`/connect/guests/${guestId}/visits`, { method: 'POST', body: input }),
  listGuestVisits: (guestId) => apiRequest(`/connect/guests/${guestId}/visits`),
  createGuestList: (input) => apiRequest('/connect/lists', { method: 'POST', body: input }),
  listGuestLists: () => apiRequest('/connect/lists'),
  addGuestToList: (listId, guestId) => apiRequest(`/connect/lists/${listId}/guests/${guestId}`, { method: 'POST', body: {} }),
  listGuestsInList: (listId) => apiRequest(`/connect/lists/${listId}/guests`),
  setGuestConsent: (guestId, input) => apiRequest(`/connect/guests/${guestId}/consent`, { method: 'POST', body: input }),
  suppressGuest: (guestId, input) => apiRequest(`/connect/guests/${guestId}/suppress`, { method: 'POST', body: input }),
  previewMessageRecipients: (input) => apiRequest('/connect/messages/preview', { method: 'POST', body: input }),
};

window.SRVD_API = api;
