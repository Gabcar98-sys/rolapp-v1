// Configuración pura de la navegación del AppShell (separada para testearla).
// El id de cada ítem es la "página" activa que App.jsx renderiza.

const HISTORY_GROUP = {
  label: 'Historial',
  items: [{ id: 'history', label: 'Sesiones Finalizadas', icon: 'clock' }],
};

const DM_GROUPS = [
  {
    label: 'Principal',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'campaigns', label: 'Campañas', icon: 'book' },
      { id: 'prep', label: 'Preparar Sesión', icon: 'map' },
      { id: 'skills', label: 'Habilidades', icon: 'skills' },
      { id: 'base-characters', label: 'Personajes Base', icon: 'id-card' },
      { id: 'attributes', label: 'Bases de Atributos', icon: 'sliders' },
      { id: 'characters', label: 'Personajes', icon: 'user' },
      { id: 'items', label: 'Items', icon: 'cube' },
      { id: 'npcs', label: 'NPCs', icon: 'users' },
    ],
  },
  HISTORY_GROUP,
];

const PLAYER_GROUPS = [
  {
    label: 'Principal',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'characters', label: 'Mis Personajes', icon: 'user' },
    ],
  },
  HISTORY_GROUP,
];

export function getNavGroups(role) {
  return role === 'dm' ? DM_GROUPS : PLAYER_GROUPS;
}
