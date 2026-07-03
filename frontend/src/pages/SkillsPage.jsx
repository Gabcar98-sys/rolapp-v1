import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SkillsPanel from '../components/DMMaster/SkillsPanel.jsx';

// Habilidades (solo DM): catálogo por formato/sistema. Rediseño fino en F15.
export default function SkillsPage({ user }) {
  return (
    <Page>
      <PageHeader
        title="Habilidades"
        subtitle="Formatos y catálogo de habilidades por sistema de juego"
      />
      <SkillsPanel user={user} />
    </Page>
  );
}
