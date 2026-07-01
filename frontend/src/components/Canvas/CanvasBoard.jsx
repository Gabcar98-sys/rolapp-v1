import { Component, Suspense, lazy } from 'react';

// tldraw es pesado: se carga bajo demanda para no inflar el bundle inicial ni
// bloquear la app si la descarga falla (degradación → solo imagen compartida).
const TldrawCanvas = lazy(() => import('./TldrawCanvas.jsx'));

// Fondo de respaldo: la imagen compartida centrada, o un aviso si no hay lienzo.
function CanvasFallback({ imageUrl, message }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-ink-800">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Mapa compartido"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <p className="px-4 text-center text-sm text-gray-600">
          {message ?? 'Sin imagen compartida.'}
        </p>
      )}
    </div>
  );
}

// Error boundary: si tldraw falla al cargar o al renderizar, la app no se rompe;
// caemos al fondo con la imagen compartida.
class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <CanvasFallback
          imageUrl={this.props.imageUrl}
          message="El lienzo de dibujo no está disponible; se muestra la imagen compartida."
        />
      );
    }
    return this.props.children;
  }
}

// Lienzo de la sesión. Envuelve tldraw en un límite de error + Suspense para que
// una falla de carga degrade con gracia sin tumbar la vista de sesión.
export default function CanvasBoard({ sessionId, imageUrl }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-card border border-ink-line bg-ink-800">
      <CanvasErrorBoundary imageUrl={imageUrl}>
        <Suspense fallback={<CanvasFallback imageUrl={imageUrl} message="Cargando lienzo…" />}>
          <TldrawCanvas sessionId={sessionId} imageUrl={imageUrl} />
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  );
}
