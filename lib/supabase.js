const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
// Prefer the secret key (service_role) for server-side ops; fall back to publishable (anon) key
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function sbFetch(path, { method = 'GET', body, headers = {}, prefer } = {}) {
  if (!isConfigured()) {
    throw new Error('Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.hint)) || `Supabase HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function sbRpc(fnName, params = {}) {
  return sbFetch(`rpc/${fnName}`, { method: 'POST', body: params });
}

async function findOrCreateUser({ username, email = '', phone = '' }) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('Username is required');
  const existing = await sbFetch(`users?username=ilike.${encodeURIComponent(clean)}&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) return existing[0];
  const created = await sbFetch('users', {
    method: 'POST',
    prefer: 'return=representation',
    body: { username: clean, email: email || null, phone: phone || null }
  });
  return Array.isArray(created) ? created[0] : created;
}

module.exports = { isConfigured, sbFetch, sbRpc, findOrCreateUser };
