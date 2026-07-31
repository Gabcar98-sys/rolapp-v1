// Enrutado por hash (#/…) sin dependencias (decisión §2.1 de tv_view_and_online.md).
// El hash NO viaja al servidor, así que la app es enlazable y sobrevive a cualquier
// proxy de la LAN sin tocar la config de nginx. Las páginas NO importan este módulo:
// siguen recibiendo `onNavigate(page)`; lo único que cambia es que App.jsx deriva la
// página del hash y `onNavigate` lo escribe.
import { useEffect, useState } from 'react';

// Páginas del sidebar (las que viven dentro del AppShell + la full-bleed 'prep').
export const PAGES = [
  'dashboard',
  'campaigns',
  'prep',
  'skills',
  'base-characters',
  'attributes',
  'characters',
  'items',
  'npcs',
  'history',
];

const PAGE_SET = new Set(PAGES);

// Rutas con id de sesión: la sesión en vivo y la vista de televisor (solo lectura).
const SESSION_PAGES = new Set(['session', 'tv']);

const DEFAULT_ROUTE = { page: 'dashboard', sessionId: null };

// parseHash('#/session/12') → { page: 'session', sessionId: 12 }.
// Tolera '#', '#/', barras finales y hashes desconocidos (caen al dashboard).
export function parseHash(hash = '') {
  const raw = String(hash ?? '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!raw) return { ...DEFAULT_ROUTE };

  const [head, tail] = raw.split('/');
  if (SESSION_PAGES.has(head)) {
    const id = Number(tail);
    // Un id no numérico (o ausente) no es una ruta de sesión válida.
    if (!Number.isInteger(id) || id <= 0) return { ...DEFAULT_ROUTE };
    return { page: head, sessionId: id };
  }
  return PAGE_SET.has(head) ? { page: head, sessionId: null } : { ...DEFAULT_ROUTE };
}

// buildHash({ page: 'tv', sessionId: 12 }) → '#/tv/12'.
export function buildHash({ page = 'dashboard', sessionId = null } = {}) {
  if (SESSION_PAGES.has(page)) {
    const id = Number(sessionId);
    if (Number.isInteger(id) && id > 0) return `#/${page}/${id}`;
    return '#/dashboard';
  }
  return `#/${PAGE_SET.has(page) ? page : 'dashboard'}`;
}

// Escribe el hash. Acepta un string ('#/dashboard') o una ruta ({ page, sessionId }).
export function navigate(route) {
  if (typeof window === 'undefined') return;
  const next = typeof route === 'string' ? route : buildHash(route);
  if (window.location.hash !== next) window.location.hash = next;
}

// URL absoluta de una ruta (para abrir la vista TV en otra pestaña / teclearla en el
// navegador del televisor). El origin es el que ya sirve la app en la LAN.
export function routeUrl(route) {
  if (typeof window === 'undefined') return buildHash(route);
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${buildHash(route)}`;
}

// Ruta actual + suscripción a hashchange.
export function useHashRoute() {
  const [route, setRoute] = useState(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash)
  );

  useEffect(() => {
    const onChange = () => {
      const next = parseHash(window.location.hash);
      // Mantiene la identidad del objeto si la ruta no cambió (evita renders inútiles).
      setRoute((prev) =>
        prev.page === next.page && prev.sessionId === next.sessionId ? prev : next
      );
    };
    window.addEventListener('hashchange', onChange);
    // Sincroniza por si el hash cambió entre el primer render y el montaje.
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
