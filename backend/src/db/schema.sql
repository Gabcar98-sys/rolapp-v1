-- ════════════════════════════════════════════════════════════════════════════════
-- Esquema consolidado — RolApp v1.0 (baseline F1)
-- ════════════════════════════════════════════════════════════════════════════════
-- Reúne en un solo archivo toda la ESTRUCTURA que en la v0 estaba dispersa en
-- schema.sql + 31 migraciones. Las columnas añadidas por migraciones (is_core,
-- has_max, formula, rank, prep_id, parent_event_id, game_system_id, etc.) ya están
-- aplicadas directamente en cada CREATE TABLE.
--
-- NO contiene contenido de juego (Stormlight/Dragonbane/Bridge Nine): en la v1.0
-- los juegos entran como datos vía packs JSON, nunca como seeds en código.
--
-- Tablas legacy de la v0 EXCLUIDAS a propósito:
--   - campaign_attribute_definitions  → reemplazada por attribute_templates
--   - character_attribute_values      → reemplazada por character_template_attr_values
--
-- La tabla virtual vec_chunks (sqlite-vec) NO se crea aquí: se crea en db/index.js
-- de forma condicional tras cargar la extensión, ya que requiere vec0 disponible.

-- ── Identidad / usuarios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  pin_hash   TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK(role IN ('dm', 'player')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Campañas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  dm_id          INTEGER NOT NULL REFERENCES users(id),
  game_system    TEXT    NOT NULL DEFAULT '',
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE SET NULL,
  description    TEXT    NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Sesiones ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  dm_id       INTEGER NOT NULL REFERENCES users(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  prep_id     INTEGER REFERENCES session_preps(id),
  status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Miembros de sesión (puente usuarios ↔ sesión) ─────────────────────────────
CREATE TABLE IF NOT EXISTS session_members (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  joined_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, user_id)
);

-- ── Sesión ↔ Personaje (puente many-to-many) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS session_characters (
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  character_id INTEGER NOT NULL REFERENCES characters(id),
  joined_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (session_id, character_id)
);

-- ── Log de eventos de sesión (APPEND-ONLY: solo INSERT, nunca UPDATE/DELETE) ──
CREATE TABLE IF NOT EXISTS session_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  type       TEXT    NOT NULL,
  actor_id   INTEGER REFERENCES users(id),
  target_id  INTEGER,
  payload    TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Mensajería ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id),
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id   INTEGER REFERENCES users(id),
  body         TEXT    NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Estado del canvas compartido ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canvas_state (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL UNIQUE REFERENCES sessions(id),
  image_url       TEXT,
  tldraw_snapshot TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ════════════════════════════════════════════════════════════════════════════════
-- GAME SYSTEMS (sistemas de juego configurables)
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Plantillas de sistema de juego ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_system_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  dm_id       INTEGER NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Plantillas de atributos (incluye is_core, has_max, formula) ───────────────
CREATE TABLE IF NOT EXISTS attribute_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_system_templates(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  type           TEXT    NOT NULL DEFAULT 'text' CHECK(type IN ('number','text','boolean')),
  category       TEXT    NOT NULL DEFAULT 'general',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_core        INTEGER NOT NULL DEFAULT 0,
  has_max        INTEGER NOT NULL DEFAULT 0,
  formula        TEXT    NOT NULL DEFAULT ''
);

-- ── Plantillas de personaje (presets de atributos por sistema) ────────────────
CREATE TABLE IF NOT EXISTS character_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_system_templates(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS character_template_values (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  character_template_id INTEGER NOT NULL REFERENCES character_templates(id) ON DELETE CASCADE,
  attribute_template_id INTEGER NOT NULL REFERENCES attribute_templates(id) ON DELETE CASCADE,
  default_value         TEXT    NOT NULL DEFAULT '',
  UNIQUE(character_template_id, attribute_template_id)
);

-- ── Formatos de habilidad + habilidades del catálogo ──────────────────────────
CREATE TABLE IF NOT EXISTS skill_formats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id          INTEGER NOT NULL REFERENCES users(id),
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE SET NULL,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS skill_format_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id  INTEGER NOT NULL REFERENCES skill_formats(id) ON DELETE CASCADE,
  field_name TEXT    NOT NULL,
  field_type TEXT    NOT NULL DEFAULT 'text' CHECK(field_type IN ('text','number','boolean')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id   INTEGER NOT NULL REFERENCES skill_formats(id) ON DELETE CASCADE,
  dm_id       INTEGER NOT NULL REFERENCES users(id),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS skill_field_values (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES skill_format_fields(id) ON DELETE CASCADE,
  value    TEXT    NOT NULL DEFAULT '',
  UNIQUE(skill_id, field_id)
);

-- ── Sistema de objetos (formatos + masters configurables) ─────────────────────
CREATE TABLE IF NOT EXISTS item_formats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id          INTEGER NOT NULL REFERENCES users(id),
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE SET NULL,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS item_format_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id  INTEGER NOT NULL REFERENCES item_formats(id) ON DELETE CASCADE,
  field_name TEXT    NOT NULL,
  field_type TEXT    NOT NULL DEFAULT 'text' CHECK(field_type IN ('text','number','boolean')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_masters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  format_id   INTEGER NOT NULL REFERENCES item_formats(id) ON DELETE CASCADE,
  dm_id       INTEGER NOT NULL REFERENCES users(id),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  equippable  INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS item_master_values (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id  INTEGER NOT NULL REFERENCES item_masters(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES item_format_fields(id) ON DELETE CASCADE,
  value    TEXT    NOT NULL DEFAULT '',
  UNIQUE(item_id, field_id)
);

-- ── Plantillas de slots de equipamiento ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_slot_templates (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_system_templates(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  slot_key       TEXT    NOT NULL,
  max_items      INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ── Mecánicas de juego configurables ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_mechanics (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER NOT NULL REFERENCES game_system_templates(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  mechanic_type  TEXT    NOT NULL DEFAULT 'custom'
                   CHECK(mechanic_type IN ('inventory_weight','inventory_type','inventory_slot','custom')),
  affects        TEXT    NOT NULL DEFAULT 'general'
                   CHECK(affects IN ('inventory','equipment','attributes','combat','general')),
  description    TEXT    NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS game_mechanic_params (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mechanic_id INTEGER NOT NULL REFERENCES game_mechanics(id) ON DELETE CASCADE,
  param_name  TEXT    NOT NULL,
  param_type  TEXT    NOT NULL DEFAULT 'text'
                CHECK(param_type IN ('text','number','boolean','list')),
  param_value TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ── Personajes base (pregens reutilizables del DM) ────────────────────────────
CREATE TABLE IF NOT EXISTS base_characters (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE SET NULL,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  avatar_icon    TEXT    NOT NULL DEFAULT '🧙',
  is_public      INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS base_character_attrs (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  base_character_id     INTEGER NOT NULL REFERENCES base_characters(id) ON DELETE CASCADE,
  attribute_template_id INTEGER REFERENCES attribute_templates(id) ON DELETE CASCADE,
  attr_name             TEXT    NOT NULL,
  attr_type             TEXT    NOT NULL DEFAULT 'text' CHECK(attr_type IN ('text','number','boolean')),
  attr_category         TEXT    NOT NULL DEFAULT 'general',
  value                 TEXT    NOT NULL DEFAULT '',
  sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS base_character_inventory (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  base_character_id INTEGER NOT NULL REFERENCES base_characters(id) ON DELETE CASCADE,
  item_name         TEXT    NOT NULL,
  quantity          INTEGER NOT NULL DEFAULT 1,
  description       TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS base_character_skill_links (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  base_character_id INTEGER NOT NULL REFERENCES base_characters(id) ON DELETE CASCADE,
  skill_id          INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rank              INTEGER NOT NULL DEFAULT 0,
  UNIQUE(base_character_id, skill_id)
);

-- ════════════════════════════════════════════════════════════════════════════════
-- PERSONAJES (instancias de jugador)
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Personajes (desacoplados de la sesión; vínculo vía session_characters) ────
CREATE TABLE IF NOT EXISTS characters (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 INTEGER NOT NULL REFERENCES users(id),
  name                    TEXT    NOT NULL,
  game_system_template_id INTEGER REFERENCES game_system_templates(id),
  created_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Valores de atributos del personaje (incluye max_value) ────────────────────
CREATE TABLE IF NOT EXISTS character_template_attr_values (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id          INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  attribute_template_id INTEGER NOT NULL REFERENCES attribute_templates(id) ON DELETE CASCADE,
  value                 TEXT    NOT NULL DEFAULT '',
  max_value             TEXT    DEFAULT NULL,
  UNIQUE(character_id, attribute_template_id)
);

-- ── Habilidades manuales del personaje (incluye skill_list) ───────────────────
CREATE TABLE IF NOT EXISTS character_skills (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  skill_list   TEXT    NOT NULL DEFAULT 'General',
  source       TEXT    NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','dm_assigned'))
);

-- ── Vínculos de personaje a habilidades del catálogo (incluye rank) ───────────
CREATE TABLE IF NOT EXISTS character_skill_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill_id     INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  rank         INTEGER NOT NULL DEFAULT 0,
  UNIQUE(character_id, skill_id)
);

-- ── Inventario del personaje ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_inventory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_name    TEXT    NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  description  TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Equipamiento del personaje (slot ↔ item master) ───────────────────────────
CREATE TABLE IF NOT EXISTS character_equipment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot_id      INTEGER NOT NULL REFERENCES equipment_slot_templates(id) ON DELETE CASCADE,
  item_id      INTEGER NOT NULL REFERENCES item_masters(id) ON DELETE CASCADE,
  notes        TEXT    NOT NULL DEFAULT '',
  equipped_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(character_id, slot_id, item_id)
);

-- ════════════════════════════════════════════════════════════════════════════════
-- PLANIFICACIÓN (motor de prep: preps → locations → eventos en grafo)
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Preparaciones de sesión ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_preps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id       INTEGER NOT NULL REFERENCES users(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Localizaciones y sub-localizaciones ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prep_id     INTEGER NOT NULL REFERENCES session_preps(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sub_locations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Plantillas de evento (grafo: jerarquía padre/hijo + ramas) ────────────────
CREATE TABLE IF NOT EXISTS event_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id     INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  prep_id         INTEGER REFERENCES session_preps(id),
  sub_location_id INTEGER REFERENCES sub_locations(id) ON DELETE CASCADE,
  parent_event_id INTEGER REFERENCES event_templates(id) ON DELETE CASCADE,
  dm_id           INTEGER NOT NULL REFERENCES users(id),
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  category        TEXT    NOT NULL DEFAULT 'general',
  branch_label    TEXT    NOT NULL DEFAULT '',
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Enlaces cruzados entre eventos (aristas del grafo) ────────────────────────
CREATE TABLE IF NOT EXISTS event_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_event_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  to_event_id   INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  label         TEXT    NOT NULL DEFAULT '',
  UNIQUE(from_event_id, to_event_id)
);

-- ── Participantes de un evento ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_participants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_template_id INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  type              TEXT    NOT NULL DEFAULT 'personaje'
                      CHECK(type IN ('personaje','npc','enemigo')),
  character_id      INTEGER REFERENCES characters(id) ON DELETE SET NULL
);

-- ── NPCs (incluye game_system_id) + quests, inventario, vínculos a campaña ────
CREATE TABLE IF NOT EXISTS npcs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  dm_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE SET NULL,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  avatar_icon    TEXT    NOT NULL DEFAULT '🧑',
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS npc_campaign_links (
  npc_id      INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  PRIMARY KEY (npc_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS npc_quests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_id      INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  reward      TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS npc_inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_id      INTEGER NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  item_name   TEXT    NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  description TEXT    NOT NULL DEFAULT '',
  cost        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ════════════════════════════════════════════════════════════════════════════════
-- POST-SESIÓN (notas, resúmenes, estadísticas)
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Notas de sesión (del DM, opcionalmente públicas) ──────────────────────────
CREATE TABLE IF NOT EXISTS session_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  dm_id      INTEGER NOT NULL REFERENCES users(id),
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  event_type TEXT    NOT NULL DEFAULT 'general',
  is_public  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Resúmenes de sesión (generados por IA) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_summaries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL UNIQUE REFERENCES sessions(id),
  body         TEXT    NOT NULL,
  generated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Estadísticas de sesión (NUEVA en v1.0, §7; payload JSON precomputado) ─────
CREATE TABLE IF NOT EXISTS session_stats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL UNIQUE REFERENCES sessions(id),
  payload      TEXT    NOT NULL DEFAULT '{}',
  generated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ════════════════════════════════════════════════════════════════════════════════
-- RAG (documentos de juego + chunks; embeddings van en vec_chunks vía sqlite-vec)
-- ════════════════════════════════════════════════════════════════════════════════

-- ── Documentos de juego indexados ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_docs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  game_system_id INTEGER REFERENCES game_system_templates(id) ON DELETE CASCADE,
  title          TEXT,
  source_path    TEXT,
  content_hash   TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Chunks de documento (texto; el embedding 768d vive en vec_chunks) ─────────
CREATE TABLE IF NOT EXISTS doc_chunks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id         INTEGER REFERENCES game_docs(id) ON DELETE CASCADE,
  game_system_id INTEGER,
  heading_path   TEXT,
  section_type   TEXT    DEFAULT 'general',
  chunk_text     TEXT    NOT NULL,
  token_count    INTEGER DEFAULT 0,
  sort_order     INTEGER DEFAULT 0
);
