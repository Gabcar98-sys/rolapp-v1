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
  createSession: (name, dmId, campaignId = null, prepId = null) =>
    request('/sessions', {
      method: 'POST',
      body: { name, dm_id: dmId, campaign_id: campaignId, prep_id: prepId },
    }),
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

  // ── Disparo de evento de planificación / NPC (extiende POST /sessions/:id/events) ──
  firePlanningEvent: (sessionId, payload) =>
    request(`/sessions/${sessionId}/events`, { method: 'POST', body: payload }),

  // ── Preparaciones de sesión ───────────────────────────────────────────────────
  listPreps: (dmId, campaignId = null) =>
    request(`/session-preps?dm_id=${dmId}${campaignId ? `&campaign_id=${campaignId}` : ''}`),
  getPrep: (id) => request(`/session-preps/${id}`),
  createPrep: (dmId, name, campaignId = null, description = '') =>
    request('/session-preps', {
      method: 'POST',
      body: { dm_id: dmId, name, campaign_id: campaignId, description },
    }),
  deletePrep: (id, dmId) =>
    request(`/session-preps/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Ubicaciones ─────────────────────────────────────────────────────────────
  createLocation: (prepId, name, dmId, description = '') =>
    request('/locations', {
      method: 'POST',
      body: { prep_id: prepId, name, description, dm_id: dmId },
    }),
  deleteLocation: (id, dmId) =>
    request(`/locations/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Sub-ubicaciones ───────────────────────────────────────────────────────────
  createSubLocation: (locationId, name, dmId, description = '') =>
    request('/sub-locations', {
      method: 'POST',
      body: { location_id: locationId, name, description, dm_id: dmId },
    }),
  deleteSubLocation: (id, dmId) =>
    request(`/sub-locations/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Plantillas de evento ──────────────────────────────────────────────────────
  listEventTemplates: (dmId, campaignId = null, prepId = null) => {
    const params = new URLSearchParams({ dm_id: dmId });
    if (campaignId) params.set('campaign_id', campaignId);
    if (prepId) params.set('prep_id', prepId);
    return request(`/event-templates?${params.toString()}`);
  },
  createEventTemplate: (body) =>
    request('/event-templates', { method: 'POST', body }),
  deleteEventTemplate: (id, dmId) =>
    request(`/event-templates/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Enlaces entre eventos ─────────────────────────────────────────────────────
  createEventLink: (fromEventId, toEventId, dmId, label = '') =>
    request('/event-templates/links', {
      method: 'POST',
      body: { from_event_id: fromEventId, to_event_id: toEventId, label, dm_id: dmId },
    }),
  deleteEventLink: (id, dmId) =>
    request(`/event-templates/links/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── NPCs ──────────────────────────────────────────────────────────────────────
  listNpcs: (dmId, gameSystemId = null) =>
    request(`/npcs?dm_id=${dmId}${gameSystemId ? `&game_system_id=${gameSystemId}` : ''}`),
  getNpc: (id) => request(`/npcs/${id}`),
  createNpc: (dmId, name, description = '', avatarIcon = '🧑') =>
    request('/npcs', {
      method: 'POST',
      body: { dm_id: dmId, name, description, avatar_icon: avatarIcon },
    }),
  deleteNpc: (id, dmId) => request(`/npcs/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),
};
