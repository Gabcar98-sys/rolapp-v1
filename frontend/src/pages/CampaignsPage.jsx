import Icon from '../components/ui/Icon.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// Campañas: placeholder limpio — la página completa (grid de tarjetas) llega en F14.
export default function CampaignsPage() {
  return (
    <Page>
      <PageHeader title="Campañas" subtitle="Tus campañas y su estado" />
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
        <Icon name="book" size={28} className="text-muted-2" />
        <p className="text-sm text-sub">La gestión completa de campañas llega próximamente.</p>
        <p className="text-xs text-faint">
          Mientras tanto puedes crear campañas desde el Dashboard al preparar una nueva sesión.
        </p>
      </div>
    </Page>
  );
}
