import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import BaseCharactersPanel from '../components/DMMaster/BaseCharactersPanel.jsx';

// Personajes Base (solo DM): pregens reutilizables por sistema. Rediseño fino en F15.
export default function BaseCharactersPage({ user }) {
  return (
    <Page>
      <PageHeader
        title="Personajes Base"
        subtitle="Plantillas y pregens reutilizables por sistema de juego"
      />
      <BaseCharactersPanel user={user} />
    </Page>
  );
}
