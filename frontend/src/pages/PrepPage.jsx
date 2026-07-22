import { useState } from 'react';
import PrepRail from '../components/DMMaster/PrepRail.jsx';
import PrepSelector from '../components/DMMaster/PrepSelector.jsx';
import PrepWorkspace from '../components/DMMaster/PrepWorkspace.jsx';

// Preparar Sesión (solo DM), pantalla full-bleed del handoff (Preparar Sesion.dc.html):
// rail de iconos 62px propio + selector de preparaciones (entrada) o espacio de
// trabajo de la prep abierta (panel de ubicaciones 266px + vistas Lista/Grafo).
// Se renderiza fuera del AppShell (como SessionView); el rail replica la navegación.
export default function PrepPage({ user, onNavigate, onLogout }) {
  const [activePrep, setActivePrep] = useState(null);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-ink">
      <PrepRail user={user} active="prep" onNavigate={onNavigate} onLogout={onLogout} />
      {activePrep ? (
        <PrepWorkspace prep={activePrep} user={user} onBack={() => setActivePrep(null)} />
      ) : (
        <PrepSelector user={user} onOpen={setActivePrep} />
      )}
    </div>
  );
}
