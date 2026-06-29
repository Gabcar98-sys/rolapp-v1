-- ── Esquema base (F0) ──────────────────────────────────────────────────────────
-- El esquema consolidado completo llega en F1. Por ahora solo lo mínimo para auth.

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  pin_hash   TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK(role IN ('dm', 'player')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
