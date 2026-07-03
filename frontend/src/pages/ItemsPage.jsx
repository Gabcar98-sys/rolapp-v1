import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import ItemsPanel from '../components/DMMaster/ItemsPanel.jsx';

// Items (solo DM): catálogo global de objetos por sistema. Rediseño fino en F15.
export default function ItemsPage({ user }) {
  return (
    <Page>
      <PageHeader title="Items" subtitle="Formatos y catálogo de objetos por sistema de juego" />
      <ItemsPanel user={user} />
    </Page>
  );
}
