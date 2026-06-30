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

  // ── Sistemas de juego (F2) ──────────────────────────────────────────────────
  listGameSystems: (dmId) => request(`/game-systems?dm_id=${dmId}`),
  getGameSystem: (id) => request(`/game-systems/${id}`),
  createGameSystem: (dmId, name, description = '') =>
    request('/game-systems', { method: 'POST', body: { dm_id: dmId, name, description } }),
  updateGameSystem: (id, dmId, fields) =>
    request(`/game-systems/${id}`, { method: 'PUT', body: { dm_id: dmId, ...fields } }),
  deleteGameSystem: (id, dmId) =>
    request(`/game-systems/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // Atributos
  createAttribute: (systemId, dmId, attr) =>
    request(`/game-systems/${systemId}/attributes`, { method: 'POST', body: { dm_id: dmId, ...attr } }),
  updateAttribute: (systemId, attrId, dmId, fields) =>
    request(`/game-systems/${systemId}/attributes/${attrId}`, { method: 'PUT', body: { dm_id: dmId, ...fields } }),
  deleteAttribute: (systemId, attrId, dmId) =>
    request(`/game-systems/${systemId}/attributes/${attrId}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // Slots de equipo
  createEquipmentSlot: (systemId, dmId, slot) =>
    request(`/game-systems/${systemId}/equipment-slots`, { method: 'POST', body: { dm_id: dmId, ...slot } }),
  deleteEquipmentSlot: (systemId, slotId, dmId) =>
    request(`/game-systems/${systemId}/equipment-slots/${slotId}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // Mecánicas (+ params)
  createMechanic: (systemId, dmId, mech) =>
    request(`/game-systems/${systemId}/mechanics`, { method: 'POST', body: { dm_id: dmId, ...mech } }),
  deleteMechanic: (systemId, mechId, dmId) =>
    request(`/game-systems/${systemId}/mechanics/${mechId}`, { method: 'DELETE', body: { dm_id: dmId } }),
  createMechanicParam: (systemId, mechId, dmId, param) =>
    request(`/game-systems/${systemId}/mechanics/${mechId}/params`, { method: 'POST', body: { dm_id: dmId, ...param } }),
  deleteMechanicParam: (systemId, mechId, paramId, dmId) =>
    request(`/game-systems/${systemId}/mechanics/${mechId}/params/${paramId}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Formatos de habilidad + habilidades ───────────────────────────────────────
  listSkillFormats: (dmId, gameSystemId = null) => {
    const params = new URLSearchParams({ dm_id: dmId });
    if (gameSystemId) params.set('game_system_id', gameSystemId);
    return request(`/skills/formats?${params.toString()}`);
  },
  getSkillFormat: (id) => request(`/skills/formats/${id}`),
  createSkillFormat: (dmId, name, gameSystemId = null, description = '') =>
    request('/skills/formats', { method: 'POST', body: { dm_id: dmId, name, game_system_id: gameSystemId, description } }),
  deleteSkillFormat: (id, dmId) =>
    request(`/skills/formats/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),
  createSkillField: (formatId, dmId, field) =>
    request(`/skills/formats/${formatId}/fields`, { method: 'POST', body: { dm_id: dmId, ...field } }),
  deleteSkillField: (formatId, fieldId, dmId) =>
    request(`/skills/formats/${formatId}/fields/${fieldId}`, { method: 'DELETE', body: { dm_id: dmId } }),
  createSkill: (dmId, formatId, name, description = '', values = {}) =>
    request('/skills', { method: 'POST', body: { dm_id: dmId, format_id: formatId, name, description, values } }),
  deleteSkill: (id, dmId) => request(`/skills/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Formatos de objeto + objetos ──────────────────────────────────────────────
  listItemFormats: (dmId, gameSystemId = null) => {
    const params = new URLSearchParams({ dm_id: dmId });
    if (gameSystemId) params.set('game_system_id', gameSystemId);
    return request(`/items/formats?${params.toString()}`);
  },
  getItemFormat: (id) => request(`/items/formats/${id}`),
  createItemFormat: (dmId, name, gameSystemId = null, description = '') =>
    request('/items/formats', { method: 'POST', body: { dm_id: dmId, name, game_system_id: gameSystemId, description } }),
  deleteItemFormat: (id, dmId) =>
    request(`/items/formats/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),
  createItemField: (formatId, dmId, field) =>
    request(`/items/formats/${formatId}/fields`, { method: 'POST', body: { dm_id: dmId, ...field } }),
  deleteItemField: (formatId, fieldId, dmId) =>
    request(`/items/formats/${formatId}/fields/${fieldId}`, { method: 'DELETE', body: { dm_id: dmId } }),
  createItem: (dmId, formatId, name, description = '', equippable = true, values = {}) =>
    request('/items', { method: 'POST', body: { dm_id: dmId, format_id: formatId, name, description, equippable, values } }),
  deleteItem: (id, dmId) => request(`/items/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),

  // ── Import / Export de packs ────────────────────────────────────────────────
  importGamePack: (dmId, pack) =>
    request('/game-packs/import', { method: 'POST', body: { dm_id: dmId, pack } }),
  exportGameSystem: (id) => request(`/game-systems/${id}/export`),

  // ── Personajes (F3) ───────────────────────────────────────────────────────
  listMyCharacters: (userId) => request(`/characters?user_id=${userId}`),
  listSessionCharacters: (sessionId) => request(`/characters/session/${sessionId}`),
  getCharacter: (id) => request(`/characters/${id}`),
  createCharacter: (userId, name, gameSystemTemplateId = null) =>
    request('/characters', {
      method: 'POST',
      body: { user_id: userId, name, game_system_template_id: gameSystemTemplateId },
    }),
  updateCharacter: (id, userId, fields) =>
    request(`/characters/${id}`, { method: 'PATCH', body: { user_id: userId, ...fields } }),
  deleteCharacter: (id, userId) =>
    request(`/characters/${id}`, { method: 'DELETE', body: { user_id: userId } }),
  setCharacterAttributes: (id, userId, values) =>
    request(`/characters/${id}/attributes`, { method: 'PUT', body: { user_id: userId, values } }),
  // Skills del catálogo (enlace con rank)
  linkCharacterSkill: (id, userId, skillId, rank = 0) =>
    request(`/characters/${id}/skill-links`, { method: 'POST', body: { user_id: userId, skill_id: skillId, rank } }),
  unlinkCharacterSkill: (id, userId, skillId) =>
    request(`/characters/${id}/skill-links/${skillId}`, { method: 'DELETE', body: { user_id: userId } }),
  // Skills manuales
  addCharacterSkill: (id, userId, skill) =>
    request(`/characters/${id}/skills`, { method: 'POST', body: { user_id: userId, ...skill } }),
  deleteCharacterSkill: (id, userId, skillId) =>
    request(`/characters/${id}/skills/${skillId}`, { method: 'DELETE', body: { user_id: userId } }),
  // Inventario
  addCharacterItem: (id, userId, item) =>
    request(`/characters/${id}/inventory`, { method: 'POST', body: { user_id: userId, ...item } }),
  updateCharacterItem: (id, userId, itemId, fields) =>
    request(`/characters/${id}/inventory/${itemId}`, { method: 'PUT', body: { user_id: userId, ...fields } }),
  deleteCharacterItem: (id, userId, itemId) =>
    request(`/characters/${id}/inventory/${itemId}`, { method: 'DELETE', body: { user_id: userId } }),
  // Equipo
  equipItem: (id, userId, slotId, itemId, notes = '') =>
    request(`/characters/${id}/equipment`, { method: 'POST', body: { user_id: userId, slot_id: slotId, item_id: itemId, notes } }),
  unequipItem: (id, userId, equipId) =>
    request(`/characters/${id}/equipment/${equipId}`, { method: 'DELETE', body: { user_id: userId } }),
  // Vínculo a sesión
  linkCharacterToSession: (id, userId, sessionId) =>
    request(`/characters/${id}/sessions/${sessionId}`, { method: 'POST', body: { user_id: userId } }),
  addCharacterToSession: (sessionId, characterId, userId) =>
    request(`/sessions/${sessionId}/characters`, { method: 'POST', body: { character_id: characterId, user_id: userId } }),

  // ── Personajes base (pregens del DM) ────────────────────────────────────────
  listBaseCharacters: (dmId = null, gameSystemId = null) => {
    const params = new URLSearchParams();
    if (dmId) params.set('dm_id', dmId);
    if (gameSystemId) params.set('game_system_id', gameSystemId);
    const qs = params.toString();
    return request(`/base-characters${qs ? `?${qs}` : ''}`);
  },
  getBaseCharacter: (id) => request(`/base-characters/${id}`),
  createBaseCharacter: (dmId, fields) =>
    request('/base-characters', { method: 'POST', body: { dm_id: dmId, ...fields } }),
  updateBaseCharacter: (id, dmId, fields) =>
    request(`/base-characters/${id}`, { method: 'PUT', body: { dm_id: dmId, ...fields } }),
  deleteBaseCharacter: (id, dmId) =>
    request(`/base-characters/${id}`, { method: 'DELETE', body: { dm_id: dmId } }),
  setBaseCharacterAttrs: (id, dmId, attrs) =>
    request(`/base-characters/${id}/attrs`, { method: 'PUT', body: { dm_id: dmId, attrs } }),
  addBaseCharacterItem: (id, dmId, item) =>
    request(`/base-characters/${id}/inventory`, { method: 'POST', body: { dm_id: dmId, ...item } }),
  deleteBaseCharacterItem: (id, dmId, itemId) =>
    request(`/base-characters/${id}/inventory/${itemId}`, { method: 'DELETE', body: { dm_id: dmId } }),
  linkBaseCharacterSkill: (id, dmId, skillId, rank = 0) =>
    request(`/base-characters/${id}/skill-links`, { method: 'POST', body: { dm_id: dmId, skill_id: skillId, rank } }),
  unlinkBaseCharacterSkill: (id, dmId, skillId) =>
    request(`/base-characters/${id}/skill-links/${skillId}`, { method: 'DELETE', body: { dm_id: dmId } }),
  adoptBaseCharacter: (id, userId, name = null) =>
    request(`/base-characters/${id}/adopt`, { method: 'POST', body: { user_id: userId, name } }),
};
