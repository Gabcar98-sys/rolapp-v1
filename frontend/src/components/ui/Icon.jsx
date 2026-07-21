// Set de iconos de línea SVG inline (estilo feather/lucide, stroke 1.6-1.8, fill none).
// Decisión de diseño del handoff: cero emojis; toda la iconografía sale de aquí.
// Uso: <Icon name="dashboard" size={18} className="text-accent-text" />
const ICONS = {
  // Navegación
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2 2 0 016 4h5v15H6a2 2 0 00-2 1V5.5z" />
      <path d="M20 5.5A2 2 0 0018 4h-5v15h5a2 2 0 012 1V5.5z" />
    </>
  ),
  map: (
    <>
      <path d="M4 21V5l6-2 5 2 5-2v14l-5 2-5-2-6 2z" />
      <path d="M10 3v16M15 5v16" />
    </>
  ),
  skills: (
    <path d="M12 3l2.1 6.3H20l-4.8 3.5 1.8 6.2L12 15.3 7 19l1.8-6.2L4 9.3h5.9z" />
  ),
  'id-card': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M14 10h4M14 14h4M5.5 16a2.8 2.8 0 015 0" />
    </>
  ),
  sliders: (
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0113 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19a6 6 0 0112 0" />
      <path d="M16 5.5a3 3 0 010 5.6M21 19a6 6 0 00-4-5.6" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21 4 16.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  logout: (
    <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  ),
  // Acciones
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
      <path d="M15 5l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </>
  ),
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
  check: <path d="M20 6L9 17l-5-5" />,
  'arrow-right': <path d="M5 12h14M12 5l7 7-7 7" />,
  'arrow-left': <path d="M19 12H5M12 19l-7-7 7-7" />,
  // Catálogos (F15)
  upload: <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />,
  download: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
  shield: <path d="M12 3l7 3v5c0 4.6-3 7.7-7 9.2C8 18.7 5 15.6 5 11V6z" />,
  heart: (
    <path d="M12 20s-7.2-4.6-9-8.6C1.6 8.2 3.6 5 6.7 5c2 0 3.4 1.1 5.3 3.1C13.9 6.1 15.3 5 17.3 5c3.1 0 5.1 3.2 3.7 6.4-1.8 4-9 8.6-9 8.6z" />
  ),
  bag: (
    <>
      <path d="M6 8h12l-1.2 12H7.2z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10h5M9.5 14h5" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  chart: <path d="M5 20v-8M11 20V5M17 20v-11M3 20h18" />,
};

// Nombres disponibles, exportados para poder validar la config de navegación en tests.
export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({ name, size = 18, strokeWidth = 1.7, className = '' }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
