// Persistencia mínima de identidad y sesión activa (decisión §2.2 de
// tv_view_and_online.md): tras un F5 o al desbloquear el móvil, el jugador vuelve a su
// mesa sin teclear el PIN.
//
// NUNCA se guarda el PIN ni ningún hash del PIN: solo id/username/role, el mismo nivel
// de confianza que ya tiene la app (LAN local, sin tokens). Todo acceso va envuelto en
// try/catch porque en modo incógnito o con el storage bloqueado `localStorage` lanza.

const USER_KEY = 'rolapp.user';
const SESSION_KEY = 'rolapp.sessionId';

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(key) {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    store()?.setItem(key, value);
  } catch {
    // Storage lleno o bloqueado: la app sigue funcionando sin persistencia.
  }
}

function removeRaw(key) {
  try {
    store()?.removeItem(key);
  } catch {
    // Igual que arriba: perder la persistencia nunca debe romper la app.
  }
}

// Usuario guardado, o null si no hay / está corrupto.
export function loadStoredUser() {
  const raw = readRaw(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (!user || !user.id || !user.username) return null;
    return { id: user.id, username: user.username, role: user.role ?? 'player' };
  } catch {
    return null;
  }
}

// Guarda SOLO los campos públicos del usuario (jamás el PIN).
export function saveStoredUser(user) {
  if (!user?.id) return;
  writeRaw(
    USER_KEY,
    JSON.stringify({ id: user.id, username: user.username, role: user.role })
  );
}

export function clearStoredUser() {
  removeRaw(USER_KEY);
}

// Id de la última sesión en la que estaba el usuario (para el auto-rejoin).
export function loadStoredSessionId() {
  const id = Number(readRaw(SESSION_KEY));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function saveStoredSessionId(sessionId) {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) return;
  writeRaw(SESSION_KEY, String(id));
}

export function clearStoredSessionId() {
  removeRaw(SESSION_KEY);
}
