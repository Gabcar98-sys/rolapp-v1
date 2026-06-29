# Verificación de features

> Cómo demostrar que una feature está correctamente implementada.
> El implementer corre estos pasos antes de reportar. El reviewer los repite de forma independiente.

---

## Verificación mínima obligatoria

```bash
# Backend
cd backend && npm run lint && npm test

# Frontend
cd frontend && npm run lint && npm run build && npm test
```

Todo debe pasar en verde. Si algo falla, la feature no está terminada.

> **Nota:** si el proyecto de tests aún no existe, el implementer lo crea como parte de
> la primera feature que requiera tests.

---

## Verificación por capa

### Esquema / migraciones (`backend/src/db/`)
- La tabla/columna tiene los tipos correctos.
- La migración tiene nombre `Mxxx_…` y es idempotente (verifica antes de aplicar).
- Levantar el backend aplica la migración sin error.

### Servicios (`backend/src/services/`)
- Funciones puras o con dependencias inyectadas donde sea posible (facilita tests).
- Acceso a DB síncrono con prepared statements.

### Routers (`backend/src/routes/`)
- Verbo HTTP y ruta correctos; registrado en `index.js`.
- Valida input; responde con shape y código consistentes.

### Frontend (`frontend/src/`)
- `npm run build` compila sin errores.
- Estilos solo Tailwind; responsive con breakpoints.
- Llamadas a API/socket vía `lib/`.

---

## Verificación manual / end-to-end

Si la feature toca UI o realtime:
1. `docker compose up --build` (o backend+frontend en dev).
2. Abrir `http://localhost:3000` (prod) o `http://localhost:5173` (dev).
3. Ejecutar el flujo de la feature y confirmar el resultado esperado.
4. Para realtime: abrir dos pestañas/dispositivos y verificar la sincronización.

---

## Reporte de verificación

El implementer escribe en `progress/impl_<feature-id>.md`:

```
## Resultado de verificación
- lint:  ✅ / ❌
- build: ✅ / ❌ / No aplica
- test:  ✅ [N pasando] / ❌ [error exacto]
- Manual / e2e: ✅ / ❌ / No aplica
```
