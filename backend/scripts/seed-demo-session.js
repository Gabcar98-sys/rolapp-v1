// Seed idempotente de UNA sesión de prueba COMPLETA para demo (F25).
//
// Qué hace (idempotente: correrlo dos veces deja el mismo estado limpio):
//   1. Borra TODAS las sesiones y sus dependientes (respeta FKs, hijos primero).
//      NO borra users, game systems, campañas, personajes, base_characters ni las
//      preps/eventos ajenos: solo la prep marcada [DEMO] y los NPCs marcados [DEMO].
//   2. Recrea una preparación demo completa: ubicaciones + sub-ubicaciones, varios
//      event_templates (con ramas), event_links con etiqueta (flujo) y eventos SUELTOS
//      enlazados (sub_location_id NULL) para ejercitar el fix de F24 en vivo.
//   3. Crea la sesión activa ligada a esa prep + campaña, con miembros (DM + jugador)
//      y personajes compatibles (coherencia de sistema, F8a).
//   4. Crea NPCs demo (uno con quest + item) y dispara eventos al log append-only:
//      planificados (con template_id + participantes), ad-hoc (sin template) y de NPC.
//   5. Inserta chat (messages) y notas (session_notes).
//   6. Genera el resumen IA (summarizeSession; usa el LLM local). Si el LLM falla,
//      registra un warning y NO aborta el resto (el resumen se regenera después).
//
// Todos los ids se resuelven por QUERY (no se hardcodean). Ver resolveContext().
//
// Correr (entorno canónico Docker, con el stack + IA arriba):
//   docker compose exec -T backend node scripts/seed-demo-session.js
//
// better-sqlite3 es SÍNCRONO; la única parte async es summarizeSession (LLM por red).

import db from '../src/db/index.js';
import { logEvent } from '../src/services/events.js';
import { summarizeSession, getSessionSummary } from '../src/services/ai.js';
import { checkCharacterFitsSession } from '../src/services/gameSystemCoherence.js';

// Nombre marcador único de la sesión Y la prep demo (permite limpieza idempotente sin
// tocar datos ajenos del DM).
const DEMO_MARKER = '[DEMO] Asedio de la Torre';
// Nombres de los NPCs demo (se recrean en cada corrida; no se tocan otros NPCs).
const DEMO_NPC_NAMES = ['Brightlord Amaram', 'Vela la mensajera', 'El Contador'];

// ── Resolución del escenario por query (sin ids hardcodeados) ─────────────────────

// Sistemas de juego que tienen documentos ingeridos (para elegir uno con reglas para el RAG).
function systemsWithDocs() {
  const rows = db.prepare('SELECT DISTINCT game_system_id AS id FROM game_docs WHERE game_system_id IS NOT NULL').all();
  return new Set(rows.map((r) => r.id));
}

// Resuelve el DM objetivo (DM1). Es obligatorio: sin él no hay demo.
function resolveDm() {
  const dm = db.prepare("SELECT id, username FROM users WHERE username = 'DM1' AND role = 'dm'").get();
  if (!dm) throw new Error("No existe el usuario DM 'DM1' (role=dm). Ajusta el recon o crea el DM.");
  return dm;
}

// Resuelve el jugador (Jugador1). Opcional: si falta, la sesión queda solo con el DM.
function resolvePlayer() {
  return db.prepare("SELECT id, username FROM users WHERE username = 'Jugador1'").get() ?? null;
}

// Resuelve la campaña demo y su sistema. Prioridad:
//   1) 'Honor' del DM con game_system_id que tenga docs.
//   2) Cualquier campaña del DM con game_system_id que tenga docs.
//   3) Crea una campaña demo bajo un sistema (del DM si es posible) que tenga docs.
function resolveCampaign(dmId) {
  const withDocs = systemsWithDocs();

  const honor = db
    .prepare("SELECT * FROM campaigns WHERE dm_id = ? AND name = 'Honor' AND game_system_id IS NOT NULL")
    .get(dmId);
  if (honor && withDocs.has(honor.game_system_id)) {
    return { campaign: honor, reason: "campaña 'Honor' del DM (sistema con docs)" };
  }

  const camps = db
    .prepare('SELECT * FROM campaigns WHERE dm_id = ? AND game_system_id IS NOT NULL ORDER BY id ASC')
    .all(dmId);
  for (const c of camps) {
    if (withDocs.has(c.game_system_id)) {
      return { campaign: c, reason: `campaña '${c.name}' del DM (fallback: sistema con docs)` };
    }
  }

  // Fallback final: crear una campaña demo bajo un sistema con docs (preferimos uno del DM).
  const ownSystem = db
    .prepare('SELECT id FROM game_system_templates WHERE dm_id = ? ORDER BY id ASC')
    .all(dmId)
    .find((s) => withDocs.has(s.id));
  const anySystem = db
    .prepare('SELECT id FROM game_system_templates ORDER BY id ASC')
    .all()
    .find((s) => withDocs.has(s.id));
  const systemId = ownSystem?.id ?? anySystem?.id;
  if (!systemId) throw new Error('No hay ningún game_system con documentos ingeridos para la demo.');

  const info = db
    .prepare("INSERT INTO campaigns (name, dm_id, game_system_id, description) VALUES ('[DEMO] Campaña de la Torre', ?, ?, 'Campaña demo creada por el seed F25')")
    .run(dmId, systemId);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(info.lastInsertRowid);
  return { campaign, reason: 'campaña demo creada (no había campaña del DM con sistema+docs)' };
}

// Elige 2 personajes compatibles con el sistema de la campaña (F8a). Prioriza Talani y
// Buenatracio; si no existen, toma los primeros compatibles.
function resolveCharacters(systemId) {
  const compat = db
    .prepare('SELECT id, name, user_id FROM characters WHERE game_system_template_id = ? ORDER BY id ASC')
    .all(systemId);
  const chosen = [];
  for (const name of ['Talani', 'Buenatracio']) {
    const c = compat.find((x) => x.name === name);
    if (c && !chosen.some((y) => y.id === c.id)) chosen.push(c);
  }
  for (const c of compat) {
    if (chosen.length >= 2) break;
    if (!chosen.some((y) => y.id === c.id)) chosen.push(c);
  }
  return chosen;
}

// ── Limpieza (borrado de TODAS las sesiones + prep/NPCs demo) ─────────────────────

// Borra TODAS las sesiones y sus tablas dependientes (hijos primero por las FKs) y, si
// existe, la prep demo (por marcador) y los NPCs demo. NO toca users/systems/campañas/
// personajes/base_characters ni preps/eventos/NPCs ajenos. Todo en una transacción.
const cleanup = db.transaction((dmId, systemId) => {
  // 1) Sesiones y dependientes. session_events es append-only en operación normal; aquí
  //    el borrado es la acción explícita pedida por el founder (reset total de sesiones).
  db.prepare('DELETE FROM session_events').run();
  db.prepare('DELETE FROM session_members').run();
  db.prepare('DELETE FROM session_characters').run();
  db.prepare('DELETE FROM session_notes').run();
  db.prepare('DELETE FROM session_summaries').run();
  db.prepare('DELETE FROM session_stats').run();
  db.prepare('DELETE FROM canvas_state').run();
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM sessions').run();

  // 2) Prep demo (por marcador). Sus event_templates SUELTOS tienen FK a prep sin cascade,
  //    así que se borran aparte ANTES de la prep (mismo patrón que routes/sessionPreps.js).
  //    Al borrar event_templates cascadean event_links y event_participants; al borrar la
  //    prep cascadean locations → sub_locations.
  const demoPreps = db.prepare('SELECT id FROM session_preps WHERE dm_id = ? AND name = ?').all(dmId, DEMO_MARKER);
  for (const p of demoPreps) {
    db.prepare('DELETE FROM event_templates WHERE prep_id = ?').run(p.id);
    db.prepare('DELETE FROM session_preps WHERE id = ?').run(p.id);
  }

  // 3) NPCs demo (por nombre + DM + sistema). Cascadean quests/inventario/vínculos.
  const delNpc = db.prepare('DELETE FROM npcs WHERE dm_id = ? AND game_system_id = ? AND name = ?');
  for (const name of DEMO_NPC_NAMES) delNpc.run(dmId, systemId, name);

  return demoPreps.length;
});

// ── Construcción de la prep demo (ubicaciones → sub-ubicaciones → eventos → enlaces) ──

const insLocation = db.prepare(
  'INSERT INTO locations (prep_id, name, description, order_index) VALUES (?, ?, ?, ?)'
);
const insSubLocation = db.prepare(
  'INSERT INTO sub_locations (location_id, name, description, order_index) VALUES (?, ?, ?, ?)'
);
const insEvent = db.prepare(`
  INSERT INTO event_templates
    (campaign_id, prep_id, sub_location_id, parent_event_id, dm_id, title, description, category, branch_label, order_index)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insParticipant = db.prepare(
  'INSERT INTO event_participants (event_template_id, name, type, character_id) VALUES (?, ?, ?, ?)'
);
const insLink = db.prepare(
  'INSERT INTO event_links (from_event_id, to_event_id, label) VALUES (?, ?, ?)'
);

// Crea un event_template y sus participantes; devuelve su id.
function createEvent(ctx, { subLocationId = null, parentId = null, title, description = '', category = 'general', branchLabel = '', order = 0, participants = [] }) {
  const info = insEvent.run(
    ctx.campaignId,
    ctx.prepId,
    subLocationId,
    parentId,
    ctx.dmId,
    title,
    description,
    category,
    branchLabel,
    order
  );
  const id = Number(info.lastInsertRowid);
  for (const p of participants) {
    insParticipant.run(id, p.name, p.type ?? 'personaje', p.character_id ?? null);
  }
  return id;
}

// Arma toda la estructura de la prep demo. Devuelve un mapa de claves → ids de evento
// (para referenciarlos luego al disparar planificados) y metadatos de conteo.
function buildPrep(ctx) {
  const talani = ctx.characters.find((c) => c.name === 'Talani') ?? ctx.characters[0] ?? null;
  const buena = ctx.characters.find((c) => c.name === 'Buenatracio') ?? ctx.characters[1] ?? null;
  const pcParticipants = [talani, buena]
    .filter(Boolean)
    .map((c) => ({ name: c.name, type: 'personaje', character_id: c.id }));

  const ev = {};

  // ── Ubicación 1: Campamento de Guerra ──
  const campamento = Number(insLocation.run(ctx.prepId, 'Campamento de Guerra', 'El campamento de Sadeas en las Llanuras Quebradas.', 0).lastInsertRowid);
  const tienda = Number(insSubLocation.run(campamento, 'Tienda del Brightlord', 'Donde Amaram da las órdenes.', 0).lastInsertRowid);
  const foso = Number(insSubLocation.run(campamento, 'Foso de reclutas', 'Los puentes-hombre esperan la próxima carga.', 1).lastInsertRowid);

  ev.consejo = createEvent(ctx, {
    subLocationId: tienda,
    title: 'Consejo de guerra',
    description: 'El Brightlord expone el plan para tomar la Torre antes del anochecer.',
    category: 'historia',
    order: 0,
    participants: [...pcParticipants, { name: 'Brightlord Amaram', type: 'npc' }],
  });
  // Dos ramas del consejo (parent_event_id + branch_label).
  ev.aceptan = createEvent(ctx, {
    parentId: ev.consejo,
    subLocationId: tienda,
    title: 'Aceptan el encargo',
    description: 'El grupo acepta cruzar el abismo y asaltar la Torre.',
    category: 'interacción',
    branchLabel: 'Aceptan el encargo',
    order: 0,
  });
  ev.exigen = createEvent(ctx, {
    parentId: ev.consejo,
    subLocationId: tienda,
    title: 'Exigen más tropas',
    description: 'Regatean con Amaram por más lanceros y esferas.',
    category: 'interacción',
    branchLabel: 'Exigen más tropas',
    order: 1,
  });

  ev.inspeccion = createEvent(ctx, {
    subLocationId: foso,
    title: 'Inspección de las tropas',
    description: 'Revisan a los puentes-hombre y el estado de los puentes.',
    category: 'exploración',
    order: 0,
  });

  // ── Ubicación 2: Las Llanuras Quebradas ──
  const llanuras = Number(insLocation.run(ctx.prepId, 'Las Llanuras Quebradas', 'Un laberinto de mesetas y abismos barrido por las altas tormentas.', 1).lastInsertRowid);
  const abismo = Number(insSubLocation.run(llanuras, 'El Abismo', 'El profundo tajo entre mesetas.', 0).lastInsertRowid);
  const torre = Number(insSubLocation.run(llanuras, 'La Torre', 'La meseta fortificada objetivo del asalto.', 1).lastInsertRowid);

  ev.descenso = createEvent(ctx, {
    subLocationId: abismo,
    title: 'El descenso al Abismo',
    description: 'Bajan por las paredes del abismo hacia el puente saboteado.',
    category: 'exploración',
    order: 0,
    participants: pcParticipants,
  });
  ev.trampa = createEvent(ctx, {
    subLocationId: abismo,
    title: 'Trampa: puente saboteado',
    description: 'Las cuerdas del puente están cortadas a medias; cede bajo el peso.',
    category: 'trampa',
    order: 1,
  });
  ev.emboscada = createEvent(ctx, {
    subLocationId: torre,
    title: 'Emboscada de los Fusionados',
    description: 'Dos Fusionados y un portador de Esquirla defienden la puerta.',
    category: 'combate',
    order: 0,
    participants: [
      { name: 'Fusionado', type: 'enemigo' },
      { name: 'Portador de Esquirla', type: 'enemigo' },
    ],
  });
  ev.corazon = createEvent(ctx, {
    subLocationId: torre,
    title: 'El corazón de la Torre',
    description: 'En la cámara superior aguarda una gema corazón intacta.',
    category: 'recompensa',
    order: 1,
  });

  // ── Enlaces del flujo principal (con etiqueta) ──
  const links = [
    [ev.aceptan, ev.inspeccion, 'tras el consejo'],
    [ev.inspeccion, ev.descenso, 'marchan al frente'],
    [ev.descenso, ev.trampa, 'en el puente'],
    [ev.trampa, ev.emboscada, 'al cruzar'],
    [ev.emboscada, ev.corazon, 'si toman la puerta'],
  ];
  for (const [from, to, label] of links) insLink.run(from, to, label);

  // ── Eventos SUELTOS enlazados (sub_location_id NULL) — ejercitan el fix de F24 ──
  ev.freeAmbush = createEvent(ctx, {
    title: 'Emboscada en el camino',
    description: 'Bandidos parshendi cortan el paso por una meseta estrecha.',
    category: 'combate',
    order: 0,
  });
  ev.freeChase = createEvent(ctx, {
    title: 'Persecución por las mesetas',
    description: 'Si huyen, los persiguen saltando abismos.',
    category: 'exploración',
    order: 1,
  });
  ev.freeCave = createEvent(ctx, {
    title: 'Refugio en una gruta',
    description: 'Una grieta ofrece cobijo de la alta tormenta que se acerca.',
    category: 'interacción',
    order: 2,
  });
  insLink.run(ev.freeAmbush, ev.freeChase, 'huyen');
  insLink.run(ev.freeChase, ev.freeCave, 'escapan');

  return { ev, links: links.length + 2, subLocations: 4, locations: 2 };
}

// ── NPCs demo ─────────────────────────────────────────────────────────────────────

function buildNpcs(ctx) {
  const insNpc = db.prepare(
    'INSERT INTO npcs (dm_id, game_system_id, name, description, avatar_icon, disposition) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const linkCampaign = db.prepare(
    'INSERT OR IGNORE INTO npc_campaign_links (npc_id, campaign_id) VALUES (?, ?)'
  );

  const amaram = Number(insNpc.run(ctx.dmId, ctx.systemId, 'Brightlord Amaram', 'Ambicioso comandante que codicia las Esquirlas.', '🛡️', 'hostile').lastInsertRowid);
  const vela = Number(insNpc.run(ctx.dmId, ctx.systemId, 'Vela la mensajera', 'Corredora de puentes leal que trae noticias del frente.', '📜', 'ally').lastInsertRowid);
  const contador = Number(insNpc.run(ctx.dmId, ctx.systemId, 'El Contador', 'Mercader de esferas que fía a interés usurero.', '💰', 'neutral').lastInsertRowid);

  for (const id of [amaram, vela, contador]) linkCampaign.run(id, ctx.campaignId);

  // Al Contador: una quest y un item.
  db.prepare('INSERT INTO npc_quests (npc_id, title, description, reward) VALUES (?, ?, ?, ?)')
    .run(contador, 'Deuda de esferas', 'Recupera 200 esferas infusas de un cofre en la Torre.', '1 hoja de Esquirla menor (préstamo)');
  db.prepare('INSERT INTO npc_inventory (npc_id, item_name, quantity, description, cost) VALUES (?, ?, ?, ?, ?)')
    .run(contador, 'Bolsa de esferas de diamante', 5, 'Esferas infusas para la marcha.', 50);

  return { amaram, vela, contador };
}

// ── Disparo de eventos al log append-only (logEvent) ──────────────────────────────

// Construye el payload de un evento PLANIFICADO (forma de routes/sessions.js POST /events).
function firePlanned(sessionId, dmId, { templateId, title, category, description, participantType = 'all', participants = [], location = '', subLocation = '', branchLabel = '' }) {
  return logEvent(sessionId, category, dmId, {
    title,
    description,
    participant_type: participantType,
    participants,
    location,
    sub_location: subLocation,
    branch_label: branchLabel,
    template_id: templateId,
    actor_type: 'dm',
    npc_id: null,
    npc_name: '',
  });
}

// Evento AD-HOC (evento rápido F20): sin template_id, actor_type 'dm'.
function fireAdhoc(sessionId, dmId, { title, category, description, participantType = 'all', participants = [] }) {
  return logEvent(sessionId, category, dmId, {
    title,
    description,
    participant_type: participantType,
    participants,
    location: '',
    sub_location: '',
    branch_label: '',
    template_id: null,
    actor_type: 'dm',
    npc_id: null,
    npc_name: '',
  });
}

// Evento de NPC: actor_type 'npc' + npc_id/npc_name.
function fireNpc(sessionId, dmId, { npcId, npcName, title, category, description }) {
  return logEvent(sessionId, category, dmId, {
    title,
    description,
    participant_type: 'all',
    participants: [],
    location: '',
    sub_location: '',
    branch_label: '',
    template_id: null,
    actor_type: 'npc',
    npc_id: npcId,
    npc_name: npcName,
  });
}

// ── Orquestación ──────────────────────────────────────────────────────────────────

// Construye todo el estado (prep, sesión, miembros, personajes, NPCs) en una transacción
// y devuelve los ids/refs necesarios para disparar eventos y chat después.
const build = db.transaction((ctxBase) => {
  // Prep demo.
  const prepInfo = db
    .prepare('INSERT INTO session_preps (dm_id, campaign_id, name, description) VALUES (?, ?, ?, ?)')
    .run(ctxBase.dmId, ctxBase.campaignId, DEMO_MARKER, 'Preparación demo: asalto a la Torre en las Llanuras Quebradas.');
  const prepId = Number(prepInfo.lastInsertRowid);

  const ctx = { ...ctxBase, prepId };
  const prep = buildPrep(ctx);
  const npcs = buildNpcs(ctx);

  // Sesión activa ligada a prep + campaña.
  const sessInfo = db
    .prepare("INSERT INTO sessions (name, dm_id, campaign_id, prep_id, status) VALUES (?, ?, ?, ?, 'active')")
    .run(DEMO_MARKER, ctx.dmId, ctx.campaignId, prepId);
  const sessionId = Number(sessInfo.lastInsertRowid);

  // Miembros: DM + jugador (si existe).
  const insMember = db.prepare('INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)');
  insMember.run(sessionId, ctx.dmId);
  if (ctx.playerId) insMember.run(sessionId, ctx.playerId);

  // Personajes: solo los que cumplen la coherencia de sistema (F8a).
  const insChar = db.prepare('INSERT OR IGNORE INTO session_characters (session_id, character_id) VALUES (?, ?)');
  const joinedChars = [];
  for (const c of ctx.characters) {
    const fit = checkCharacterFitsSession(sessionId, c.id);
    if (fit.ok) {
      insChar.run(sessionId, c.id);
      joinedChars.push(c);
    } else {
      console.warn(`  ⚠ personaje "${c.name}" (id=${c.id}) no compatible con la campaña: ${fit.error}`);
    }
  }

  // Notas: una pública, una privada del DM.
  const insNote = db.prepare(
    'INSERT INTO session_notes (session_id, dm_id, title, body, event_type, is_public) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insNote.run(sessionId, ctx.dmId, 'Escena inicial', 'La sesión arranca en la tienda de Amaram con la alta tormenta acercándose por el este.', 'general', 1);
  insNote.run(sessionId, ctx.dmId, 'Secreto del DM: la traición de Amaram', 'Amaram planea quedarse la gema corazón y culpar a los puentes-hombre de la pérdida.', 'historia', 0);

  return { prepId, sessionId, prep, npcs, joinedChars };
});

function fireTimeline(sessionId, ctx, ev, npcs, joinedChars) {
  const talani = joinedChars.find((c) => c.name === 'Talani') ?? joinedChars[0] ?? null;
  const buena = joinedChars.find((c) => c.name === 'Buenatracio') ?? joinedChars[1] ?? null;
  const specific = [talani, buena].filter(Boolean).map((c) => ({ id: c.id, name: c.name }));

  const CAMP = 'Campamento de Guerra';
  const LLAN = 'Las Llanuras Quebradas';

  // Orden cronológico coherente (planificados + ad-hoc + NPC intercalados).
  firePlanned(sessionId, ctx.dmId, {
    templateId: ev.consejo, title: 'Consejo de guerra', category: 'historia',
    description: 'El Brightlord expone el plan para tomar la Torre antes del anochecer.',
    participantType: 'all', location: CAMP, subLocation: 'Tienda del Brightlord',
  });
  fireNpc(sessionId, ctx.dmId, {
    npcId: npcs.amaram, npcName: 'Brightlord Amaram', category: 'interacción',
    title: 'Amaram exige la Esquirla', description: 'Amaram promete gloria... y una recompensa que huele a trampa.',
  });
  firePlanned(sessionId, ctx.dmId, {
    templateId: ev.aceptan, title: 'Aceptan el encargo', category: 'interacción',
    description: 'El grupo acepta cruzar el abismo y asaltar la Torre.',
    participantType: 'all', location: CAMP, subLocation: 'Tienda del Brightlord', branchLabel: 'Aceptan el encargo',
  });
  fireAdhoc(sessionId, ctx.dmId, {
    title: 'Tormenta eterna en el horizonte', category: 'exploración',
    description: 'Un muro de nubes rojas se alza al este: la alta tormenta llegará al anochecer.',
  });
  firePlanned(sessionId, ctx.dmId, {
    templateId: ev.descenso, title: 'El descenso al Abismo', category: 'exploración',
    description: 'Bajan por las paredes del abismo hacia el puente saboteado.',
    participantType: specific.length ? 'specific' : 'all', participants: specific,
    location: LLAN, subLocation: 'El Abismo',
  });
  fireAdhoc(sessionId, ctx.dmId, {
    title: 'Un puente-hombre cae al abismo', category: 'historia',
    description: 'Uno de los porteadores resbala en la roca húmeda y se precipita al vacío.',
  });
  fireNpc(sessionId, ctx.dmId, {
    npcId: npcs.vela, npcName: 'Vela la mensajera', category: 'NPC',
    title: 'Vela trae noticias del frente', description: 'Vela avisa: refuerzos parshendi rodean la Torre por el norte.',
  });
  firePlanned(sessionId, ctx.dmId, {
    templateId: ev.emboscada, title: 'Emboscada de los Fusionados', category: 'combate',
    description: 'Dos Fusionados y un portador de Esquirla defienden la puerta.',
    participantType: 'all', location: LLAN, subLocation: 'La Torre',
  });
  fireAdhoc(sessionId, ctx.dmId, {
    title: 'Botín inesperado: una gema corazón', category: 'recompensa',
    description: 'Tras el combate hallan una gema corazón infusa, aún caliente.',
  });
}

function insertChat(sessionId, dmId, playerId) {
  // Si no hay jugador, el chat queda solo con narración del DM (poco realista pero válido).
  const other = playerId ?? dmId;
  const base = Math.floor(Date.now() / 1000) - 3600; // hace ~1h, para lectura cronológica
  const rows = [
    [dmId, 'La tormenta se acerca. Estáis en la tienda del Brightlord Amaram, que os observa con desconfianza.'],
    [other, 'Talani aprieta la lanza: "¿Qué quiere de nosotros esta vez?"'],
    [dmId, 'Amaram sonríe: necesita que crucéis las Llanuras Quebradas y toméis la Torre antes del anochecer.'],
    [other, 'Buenatracio murmura: "Otra misión suicida... contad conmigo."'],
    [dmId, 'El descenso al Abismo es traicionero. Un puente-hombre resbala y cae al vacío ante vuestros ojos.'],
    [other, 'Talani intenta sujetarlo, pero solo alcanza a rozar su mano. "¡Noooo!"'],
  ];
  const insMsg = db.prepare(
    'INSERT INTO messages (session_id, from_user_id, to_user_id, body, created_at) VALUES (?, ?, NULL, ?, ?)'
  );
  const tx = db.transaction(() => {
    rows.forEach(([from, body], i) => insMsg.run(sessionId, from, body, base + i * 300));
  });
  tx();
  return rows.length;
}

// ── Dump de verificación ──────────────────────────────────────────────────────────

function dumpVerification(sessionId, summary) {
  const events = db.prepare('SELECT type, payload FROM session_events WHERE session_id = ? ORDER BY id ASC').all(sessionId);
  const byType = {};
  const byActor = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    let p = {};
    try { p = JSON.parse(e.payload); } catch { /* payload no-JSON: se cuenta como dm/adhoc */ }
    const kind = p.actor_type === 'npc' ? 'npc' : (p.template_id ? 'dm/planificado' : 'dm/adhoc');
    byActor[kind] = (byActor[kind] ?? 0) + 1;
  }

  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const prepId = one('SELECT prep_id AS v FROM sessions WHERE id = ?', sessionId).v;

  const counts = {
    sesiones_totales: one('SELECT COUNT(*) AS v FROM sessions').v,
    session_id: sessionId,
    prep_id: prepId,
    miembros: one('SELECT COUNT(*) AS v FROM session_members WHERE session_id = ?', sessionId).v,
    personajes: one('SELECT COUNT(*) AS v FROM session_characters WHERE session_id = ?', sessionId).v,
    npcs_del_dm: one('SELECT COUNT(*) AS v FROM npcs').v,
    ubicaciones: one('SELECT COUNT(*) AS v FROM locations WHERE prep_id = ?', prepId).v,
    sub_ubicaciones: one('SELECT COUNT(*) AS v FROM sub_locations WHERE location_id IN (SELECT id FROM locations WHERE prep_id = ?)', prepId).v,
    event_templates: one('SELECT COUNT(*) AS v FROM event_templates WHERE prep_id = ?', prepId).v,
    eventos_sueltos: one('SELECT COUNT(*) AS v FROM event_templates WHERE prep_id = ? AND sub_location_id IS NULL AND parent_event_id IS NULL', prepId).v,
    event_links: one('SELECT COUNT(*) AS v FROM event_links el JOIN event_templates et ON el.from_event_id = et.id WHERE et.prep_id = ?', prepId).v,
    links_entre_sueltos: one(`
      SELECT COUNT(*) AS v FROM event_links el
      JOIN event_templates a ON el.from_event_id = a.id
      JOIN event_templates b ON el.to_event_id = b.id
      WHERE a.prep_id = ? AND a.sub_location_id IS NULL AND b.sub_location_id IS NULL
    `, prepId).v,
    mensajes: one('SELECT COUNT(*) AS v FROM messages WHERE session_id = ?', sessionId).v,
    notas: one('SELECT COUNT(*) AS v FROM session_notes WHERE session_id = ?', sessionId).v,
    eventos_total: events.length,
  };

  console.log('\n════════════════ DUMP DE VERIFICACIÓN (F25) ════════════════');
  console.log(JSON.stringify(counts, null, 2));
  console.log('Eventos por type:', JSON.stringify(byType));
  console.log('Eventos por naturaleza:', JSON.stringify(byActor));
  console.log('\n──────────────── RESUMEN IA GENERADO ────────────────');
  console.log(summary?.body ? summary.body : '(sin resumen: el LLM falló o no devolvió texto)');
  console.log('══════════════════════════════════════════════════════════\n');
}

async function main() {
  console.log('Seed de sesión demo (F25) — marcador:', DEMO_MARKER);

  const dm = resolveDm();
  const player = resolvePlayer();
  const { campaign, reason } = resolveCampaign(dm.id);
  const systemId = campaign.game_system_id;
  const characters = resolveCharacters(systemId);

  console.log(`DM: ${dm.username} (id=${dm.id})`);
  console.log(`Jugador: ${player ? `${player.username} (id=${player.id})` : '(no encontrado)'}`);
  console.log(`Campaña: '${campaign.name}' (id=${campaign.id}) — ${reason}`);
  console.log(`Sistema de juego: id=${systemId}`);
  console.log(`Personajes compatibles elegidos: ${characters.map((c) => `${c.name}(id=${c.id})`).join(', ') || '(ninguno)'}`);

  const removedPreps = cleanup(dm.id, systemId);
  console.log(`Limpieza: todas las sesiones borradas; preps demo previas eliminadas=${removedPreps}`);

  const ctxBase = {
    dmId: dm.id,
    playerId: player?.id ?? null,
    campaignId: campaign.id,
    systemId,
    characters,
  };
  const { prepId, sessionId, prep, npcs, joinedChars } = build(ctxBase);
  console.log(`Prep creada id=${prepId}; sesión creada id=${sessionId} (status=active)`);
  console.log(`Estructura prep: ${prep.locations} ubicaciones, ${prep.subLocations} sub-ubicaciones, ${prep.links} enlaces`);

  fireTimeline(sessionId, ctxBase, prep.ev, npcs, joinedChars);
  const nMsg = insertChat(sessionId, dm.id, player?.id ?? null);
  console.log(`Eventos disparados y ${nMsg} mensajes de chat insertados.`);

  // Resumen IA: intenta de verdad; si el LLM falla, warning y sigue (regenerable).
  let summary = null;
  try {
    console.log('Generando resumen IA (LLM local)… puede tardar en CPU.');
    summary = await summarizeSession(sessionId);
    console.log('Resumen IA generado y guardado en session_summaries.');
  } catch (err) {
    console.warn(`⚠ El resumen IA falló (se puede regenerar): ${err.message}`);
    summary = getSessionSummary(sessionId);
  }

  dumpVerification(sessionId, summary);
  console.log('Seed demo completado.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed demo falló:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
