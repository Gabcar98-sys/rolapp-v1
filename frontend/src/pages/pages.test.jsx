import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AppShell from '../components/layout/AppShell.jsx';
import DashboardPage from './DashboardPage.jsx';
import CampaignsPage from './CampaignsPage.jsx';
import PrepPage from './PrepPage.jsx';
import SkillsPage from './SkillsPage.jsx';
import BaseCharactersPage from './BaseCharactersPage.jsx';
import AttributesPage from './AttributesPage.jsx';
import CharactersPage from './CharactersPage.jsx';
import ItemsPage from './ItemsPage.jsx';
import NpcsPage from './NpcsPage.jsx';
import HistoryPage from './HistoryPage.jsx';
import Login from './Login.jsx';

// Smoke de render (SSR estático, sin efectos): garantiza que cada sección del
// sidebar monta sin errores y que el shell pinta la navegación por rol.
const dm = { id: 1, username: 'dm1', role: 'dm' };
const player = { id: 2, username: 'ana', role: 'player' };
const noop = () => {};

const PAGES = [
  ['dashboard', <DashboardPage key="d" user={dm} onEnterSession={noop} onNavigate={noop} />],
  ['campaigns', <CampaignsPage key="c" user={dm} />],
  ['prep', <PrepPage key="p" user={dm} />],
  ['skills', <SkillsPage key="s" user={dm} />],
  ['base-characters', <BaseCharactersPage key="b" user={dm} />],
  ['attributes', <AttributesPage key="a" user={dm} />],
  ['characters', <CharactersPage key="ch" user={dm} />],
  ['items', <ItemsPage key="i" user={dm} />],
  ['npcs', <NpcsPage key="n" />],
  ['history', <HistoryPage key="h" user={dm} />],
];

describe('AppShell + páginas', () => {
  it.each(PAGES)('la página "%s" renderiza dentro del shell', (id, element) => {
    const html = renderToStaticMarkup(
      <AppShell user={dm} active={id} onNavigate={noop} onLogout={noop}>
        {element}
      </AppShell>
    );
    expect(id).toBeTruthy();
    expect(html).toContain('RolApp'); // wordmark del sidebar
    expect(html).toContain('Cerrar Sesión'); // pie del sidebar
    expect(html.length).toBeGreaterThan(500);
  });

  it('el sidebar del DM muestra todas las secciones', () => {
    const html = renderToStaticMarkup(
      <AppShell user={dm} active="dashboard" onNavigate={noop} onLogout={noop}>
        <CampaignsPage user={dm} />
      </AppShell>
    );
    for (const label of [
      'Dashboard',
      'Campañas',
      'Preparar Sesión',
      'Habilidades',
      'Personajes Base',
      'Bases de Atributos',
      'Personajes',
      'Items',
      'NPCs',
      'Sesiones Finalizadas',
    ]) {
      expect(html).toContain(label);
    }
  });

  it('el sidebar del jugador es reducido y no muestra secciones de DM', () => {
    const html = renderToStaticMarkup(
      <AppShell user={player} active="dashboard" onNavigate={noop} onLogout={noop}>
        <DashboardPage user={player} onEnterSession={noop} />
      </AppShell>
    );
    expect(html).toContain('Mis Personajes');
    expect(html).toContain('Sesiones Finalizadas');
    expect(html).not.toContain('Preparar Sesión');
    expect(html).not.toContain('Bases de Atributos');
    expect(html).not.toContain('NPCs');
  });

  it('el Dashboard del DM pinta las 4 métricas y el bloque Nueva sesión (F14)', () => {
    const html = renderToStaticMarkup(
      <DashboardPage user={dm} onEnterSession={noop} onNavigate={noop} />
    );
    for (const label of [
      'Campañas activas',
      'Sesiones activas',
      'Sesiones finalizadas',
      'Total jugadores',
      'Nueva sesión',
      'Ver historial completo',
    ]) {
      expect(html).toContain(label);
    }
  });

  it('el Dashboard del jugador no muestra métricas ni Nueva sesión (F14)', () => {
    const html = renderToStaticMarkup(
      <DashboardPage user={player} onEnterSession={noop} onNavigate={noop} />
    );
    expect(html).not.toContain('Total jugadores');
    expect(html).not.toContain('Nueva sesión');
    expect(html).toContain('Sesiones activas');
  });

  it('Campañas e Historial pintan header, acciones y filtros (F14)', () => {
    const campaignsHtml = renderToStaticMarkup(<CampaignsPage user={dm} />);
    expect(campaignsHtml).toContain('Nueva campaña');
    expect(campaignsHtml).toContain('Campañas');

    const historyHtml = renderToStaticMarkup(<HistoryPage user={dm} />);
    expect(historyHtml).toContain('Sesiones Finalizadas');
    expect(historyHtml).toContain('Buscar por nombre, campaña o resumen');
    expect(historyHtml).toContain('Todas las campañas');
  });

  it('el Login renderiza sin emojis y con el wordmark', () => {
    const html = renderToStaticMarkup(<Login onAuth={noop} />);
    expect(html).toContain('RolApp');
    expect(html).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
