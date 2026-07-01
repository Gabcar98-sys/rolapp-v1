import { useEffect, useRef } from 'react';
import { Tldraw, useEditor, getSnapshot, loadSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';
import socket from '../../lib/socket.js';

// Sincroniza el store de tldraw con la room de la sesión vía socket.
// - Al montar (y al reconectar) pide el snapshot persistido con canvas:request_snapshot.
// - Aplica los canvas:updated entrantes descartando versiones viejas.
// - Emite canvas:update con debounce para no saturar el socket.
function CanvasSync({ sessionId }) {
  const editor = useEditor();
  const isApplying = useRef(false);
  const lastVersionRef = useRef(0);

  useEffect(() => {
    function applySnapshot(document, version) {
      if (!document) return;
      isApplying.current = true;
      const current = getSnapshot(editor.store);
      loadSnapshot(editor.store, { document, session: current.session });
      isApplying.current = false;
      lastVersionRef.current = version;
    }

    function requestSnapshot() {
      socket.emit('canvas:request_snapshot', { sessionId });
    }

    function onUpdated({ document, version }) {
      if (!document) return;
      // Descarta actualizaciones que llegan tarde (versión = timestamp del emisor).
      if (version !== undefined && version < lastVersionRef.current) return;
      applySnapshot(document, version ?? Date.now());
    }

    socket.on('canvas:updated', onUpdated);
    socket.on('connect', requestSnapshot);
    requestSnapshot();

    return () => {
      socket.off('canvas:updated', onUpdated);
      socket.off('connect', requestSnapshot);
    };
  }, [editor, sessionId]);

  useEffect(() => {
    let timeout;
    const unlisten = editor.store.listen(
      () => {
        if (isApplying.current) return;
        clearTimeout(timeout);
        // Debounce: agrupa ráfagas de cambios en un solo emit.
        timeout = setTimeout(() => {
          const { document } = getSnapshot(editor.store);
          const version = Date.now();
          lastVersionRef.current = version;
          socket.emit('canvas:update', { sessionId, document, version });
        }, 200);
      },
      { scope: 'document', source: 'user' }
    );
    return () => {
      clearTimeout(timeout);
      unlisten();
    };
  }, [editor, sessionId]);

  return null;
}

// Lienzo colaborativo. La imagen compartida (si existe) va de fondo detrás del
// lienzo transparente de tldraw. Sin estilos inline: capas con utilidades Tailwind.
export default function TldrawCanvas({ sessionId, imageUrl }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Mapa compartido"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        />
      )}
      <div className="absolute inset-0">
        <Tldraw components={{ Background: () => null }}>
          <CanvasSync sessionId={sessionId} />
        </Tldraw>
      </div>
    </div>
  );
}
