import db from '../db/index.js';

// F8a — Coherencia de sistema de juego campaña ↔ personaje.
//
// Regla de negocio: un personaje solo puede unirse a una sesión cuya campaña
// tenga el mismo game_system_id que el game_system_template_id del personaje.
//
// Compatibilidad hacia atrás (se permite cualquier personaje) cuando:
//   - la sesión no tiene campaña (campaign_id NULL), o
//   - la campaña no tiene game_system_id (NULL).
//
// Devuelve { ok: true } si el vínculo es válido, o
// { ok: false, error: <mensaje> } si el personaje no pertenece al sistema.
export function checkCharacterFitsSession(sessionId, characterId) {
  const session = db.prepare('SELECT campaign_id FROM sessions WHERE id = ?').get(sessionId);
  // Sesión inexistente o sin campaña → sin restricción que aplicar aquí.
  if (!session || session.campaign_id == null) return { ok: true };

  const campaign = db
    .prepare('SELECT game_system_id FROM campaigns WHERE id = ?')
    .get(session.campaign_id);
  // Campaña sin sistema de juego definido → cualquier personaje es válido.
  if (!campaign || campaign.game_system_id == null) return { ok: true };

  const character = db
    .prepare('SELECT game_system_template_id FROM characters WHERE id = ?')
    .get(characterId);
  if (!character) return { ok: true }; // El handler ya valida la existencia del personaje.

  if (String(character.game_system_template_id) === String(campaign.game_system_id)) {
    return { ok: true };
  }

  return {
    ok: false,
    error: 'El personaje no pertenece al sistema de juego de la campaña',
  };
}
