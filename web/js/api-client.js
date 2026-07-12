/**
 * API client. Thin fetch wrapper matching the server's response envelope (Stage 9 §6).
 * No framework dependency - matches Stage 4 §2's decision to keep the vanilla core rather than
 * introduce React speculatively.
 */
const API_BASE = window.STATION_API_BASE || 'http://localhost:4001';
const TOKEN_KEY = 'station_session_token';

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
    if (res.status === 401) clearToken(); // Stage 7: Session Expired handling
    const err = new Error(json?.error?.message || 'Request failed');
    err.field = json?.error?.field || null;
    err.status = res.status;
    throw err;
  }
  return json.data;
}

const api = {
  request: apiRequest,
  register: (email, password) => apiRequest('/auth/register', { method: 'POST', body: { email, password } }),
  login: async (email, password) => {
    const data = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return data;
  },
  logout: async () => { await apiRequest('/auth/logout', { method: 'POST' }); clearToken(); },
  deleteAccount: (password) => apiRequest('/auth/delete-account', { method: 'POST', body: { password } }),
  isAuthenticated: () => Boolean(getToken()),

  logShift: (input) => apiRequest('/shifts', { method: 'POST', body: input }),
  listShifts: () => apiRequest('/shifts'),
  deleteShift: (id) => apiRequest(`/shifts/${id}`, { method: 'DELETE' }),
  getStats: () => apiRequest('/shifts/stats'),
  setGoal: (input) => apiRequest('/goals', { method: 'POST', body: input }),
  getGoalProgress: () => apiRequest('/goals'),

  createRecipe: (input) => apiRequest('/recipes', { method: 'POST', body: input }),
  listRecipes: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/recipes${qs ? '?' + qs : ''}`);
  },
  getRecipe: (id) => apiRequest(`/recipes/${id}`),
  deleteRecipe: (id) => apiRequest(`/recipes/${id}`, { method: 'DELETE' }),

  calcBatch: (input) => apiRequest('/tools/batch', { method: 'POST', body: input }),
  calcAbv: (input) => apiRequest('/tools/abv', { method: 'POST', body: input }),
  calcConvert: (input) => apiRequest('/tools/convert', { method: 'POST', body: input }),
};

window.STATION_API = api;
