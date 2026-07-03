import { useState } from 'react';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SessionPrepPanel from '../components/DMMaster/SessionPrepPanel.jsx';
import EventTemplatePanel from '../components/DMMaster/EventTemplatePanel.jsx';

// Preparar Sesión (solo DM): selector de preparaciones + constructor de eventos.
// El rediseño completo (rail 62px + panel de ubicaciones + vistas Lista/Grafo) llega en F17.
export default function PrepPage({ user }) {
  const [editingPrep, setEditingPrep] = useState(null);

  return (
    <Page>
      <PageHeader
        title="Preparar Sesión"
        subtitle="Constructor de ubicaciones, eventos y enlaces narrativos"
      />
      {editingPrep ? (
        <EventTemplatePanel user={user} prep={editingPrep} onBack={() => setEditingPrep(null)} />
      ) : (
        <SessionPrepPanel user={user} onEditPrep={setEditingPrep} />
      )}
    </Page>
  );
}
