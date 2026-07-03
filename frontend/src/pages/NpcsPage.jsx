import Icon from '../components/ui/Icon.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// NPCs: placeholder limpio — el gestor completo llega en F16.
export default function NpcsPage() {
  return (
    <Page>
      <PageHeader title="NPCs" subtitle="Personajes no jugadores de tus campañas" />
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
        <Icon name="users" size={28} className="text-muted-2" />
        <p className="text-sm text-sub">El gestor de NPCs llega próximamente.</p>
        <p className="text-xs text-faint">
          Mientras tanto puedes crear eventos de NPC desde la planificación de sesión.
        </p>
      </div>
    </Page>
  );
}
