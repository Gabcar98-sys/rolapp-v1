// Lógica pura de derivación de métricas y filtros para Dashboard, Campañas e
// Historial (F14). Sin React ni fetch: todo testeable con vitest en entorno node.

// Tamaño de la paleta de acentos por campaña (terracota + colores de categoría
// del handoff). Las clases Tailwind concretas viven en las páginas (deben ser
// estáticas para el JIT); aquí solo se decide el índice de forma estable.
export const CAMPAIGN_ACCENT_COUNT = 5;

// Índice de acento estable para una campaña a partir de su id numérico.
// -1 significa "sin campaña" (las páginas lo pintan en gris cálido neutro).
export function campaignAccentIndex(campaignId) {
  if (campaignId == null || campaignId === '') return -1;
  const n = Math.abs(Number(campaignId));
  if (!Number.isFinite(n)) return 0;
  return n % CAMPAIGN_ACCENT_COUNT;
}

// Jugadores de una sesión: los miembros sin contar al DM (que siempre es miembro).
export function playersInSession(session) {
  return Math.max((session?.member_count ?? 0) - 1, 0);
}

// Métricas de las 4 tarjetas del Dashboard, compuestas de los listados existentes.
// totalPlayers = suma de jugadores distintos por campaña (player_count del listado
// enriquecido); un jugador presente en varias campañas cuenta una vez por campaña.
export function deriveDashboardMetrics({ campaigns = [], activeSessions = [], closedSessions = [] }) {
  return {
    campaignCount: campaigns.length,
    activeSessionCount: activeSessions.length,
    closedSessionCount: closedSessions.length,
    totalPlayers: campaigns.reduce((sum, c) => sum + (c.player_count ?? 0), 0),
  };
}

// Estado de una campaña para el badge: Activa si tiene alguna sesión activa.
export function campaignIsActive(campaign) {
  return (campaign?.active_session_count ?? 0) > 0;
}

// Filtro del historial: búsqueda de texto (nombre / campaña / resumen) + campaña.
export function filterClosedSessions(sessions, { query = '', campaignId = '' } = {}) {
  const q = query.trim().toLowerCase();
  return (sessions ?? []).filter((s) => {
    if (campaignId && String(s.campaign_id ?? '') !== String(campaignId)) return false;
    if (!q) return true;
    const haystack = [s.name, s.campaign_name, s.summary]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

// Duración legible a partir de segundos: "2h 40m", "35m", o "—" si no hay dato.
export function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const totalMinutes = Math.round(n / 60);
  if (totalMinutes < 1) return '<1m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// Fecha corta en español a partir de un unixepoch en segundos: "28 jun 2026".
export function formatDate(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n * 1000)
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/\./g, '');
}
