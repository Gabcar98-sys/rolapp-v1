import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import GameSystemPanel from '../components/DMMaster/GameSystemPanel.jsx';

// Bases de Atributos (solo DM): builder de sistemas de juego (atributos, slots,
// mecánicas, habilidades, items, docs y packs). Rediseño fino en F15.
export default function AttributesPage({ user }) {
  return (
    <Page>
      <PageHeader
        title="Bases de Atributos"
        subtitle="Sistemas de juego: atributos, slots, mecánicas y packs"
      />
      <GameSystemPanel user={user} />
    </Page>
  );
}
