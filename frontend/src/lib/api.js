// Cliente API centralizado. Todas las llamadas pasan por aquí.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request('/health'),

  // ── Auth ──────────────────────────────────────────────────────────────────
  register: (username, pin, role) =>
    request('/auth/register', { method: 'POST', body: { username, pin, role } }),
  login: (username, pin) =>
    request('/auth/login', { method: 'POST', body: { username, pin } }),

  // ── Campañas ────────────────────────────────────────────────────────────────
  listCampaigns: (dmId) => request(`/campaigns?dm_id=${dmId}`),
  getCampaign: (id) => request(`/campaigns/${id}`),
  createCampaign: (name, dmId, description = '') =>
    request('/campaigns', { method: 'POST', body: { name, dm_id: dmId, description } }),

  // ── Sesiones ──────────────────────────────────────────────────────────────
  listSessions: (status = 'active') => request(`/sessions?status=${status}`),
  getSession: (id) => request(`/sessions/${id}`),
  createSession: (name, dmId, campaignId = null) =>
    request('/sessions', { method: 'POST', body: { name, dm_id: dmId, campaign_id: campaignId } }),
  closeSession: (id, dmId) =>
    request(`/sessions/${id}/close`, { method: 'PATCH', body: { dm_id: dmId } }),
  resetSession: (id, dmId) =>
    request(`/sessions/${id}/reset`, { method: 'PATCH', body: { dm_id: dmId } }),
  joinSession: (id, userId) =>
    request(`/sessions/${id}/members`, { method: 'POST', body: { user_id: userId } }),
  listEvents: (id) => request(`/sessions/${id}/events`),
  fireEvent: (id, actorId, type, payload = {}) =>
    request(`/sessions/${id}/events`, { method: 'POST', body: { actor_id: actorId, type, payload } }),

  // ── Canvas ──────────────────────────────────────────────────────────────────
  getCanvas: (sessionId) => request(`/canvas/${sessionId}`),
  setCanvasImage: (sessionId, dmId, imageUrl) =>
    request(`/canvas/${sessionId}`, { method: 'PATCH', body: { dm_id: dmId, image_url: imageUrl } }),
};
