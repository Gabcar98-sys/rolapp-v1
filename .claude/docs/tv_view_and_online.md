# Vista TV + "más en línea" — diseño

> Petición del founder (2026-07-30): *"me gustaría explorar maneras de dejar esto más en
> línea, añadir interfaces más gráficas. Una vista de sesión para pantalla del televisor y
> que puedan ver los jugadores cuando estemos todos."*
>
> Este documento es la exploración + la decisión de diseño que ejecuta **F31**.

---

## 1. Diagnóstico: qué impide hoy "estar en línea"

Tres huecos concretos, todos de frontend:

| # | Hueco | Síntoma para el founder |
|---|-------|-------------------------|
| 1 | **Cero persistencia de sesión** (`App.jsx` guarda `user`/`session` solo en `useState`) | Cualquier F5, cierre de pestaña o suspensión del móvil te devuelve al login **y te saca de la sesión en vivo**. En la mesa, un jugador que bloquea el celular vuelve a teclear su PIN. |
| 2 | **Cero rutas** (navegación por estado, una sola URL) | No hay nada que compartir. No puedes mandar "entra aquí" por WhatsApp, ni abrir la sesión en un segundo dispositivo, ni poner una URL en la TV. El botón *atrás* del navegador cierra la app. |
| 3 | **No hay vista de espectador** | La única forma de "ver la mesa" es entrar como usuario con PIN, lo que registra presencia, escribe `session_join` en el log append-only y ocupa un slot en la lista de conectados. Un televisor no debería ser un jugador. |

Los tres se resuelven juntos porque comparten cimiento: **rutas por hash**.

---

## 2. Decisiones

### 2.1 Rutas por hash (`#/…`), no react-router

- **Qué:** helper propio `lib/route.js` (`parseHash`, `navigate`, `useHashRoute`) que mapea
  `#/dashboard`, `#/campaigns`, …, `#/session/:id`, `#/tv/:id`.
- **Por qué hash y no History API:** nginx ya hace SPA fallback, pero el hash no toca el
  servidor **en absoluto** y sobrevive a cualquier configuración de proxy en la LAN.
- **Por qué no react-router:** el proyecto tiene enrutado por estado desde F13 y funciona;
  meter una dependencia de router obliga a reescribir `App.jsx`, `AppShell` y las 10 páginas.
  El helper son ~40 líneas, es testeable como función pura (lección F20) y **no cambia
  ninguna página existente**: `App.jsx` sigue haciendo `switch(active)`, solo que `active`
  ahora viene del hash en vez de un `useState` suelto.
- **Regla:** las páginas NO importan el router. Siguen recibiendo `onNavigate`. El único
  cambio es que `onNavigate` escribe el hash.

### 2.2 Persistencia de identidad en `localStorage`

- `rolapp.user` (id, username, role) y `rolapp.sessionId`.
- Al arrancar: si hay `user` guardado se restaura sin pedir PIN; si además la URL es
  `#/session/:id` **y esa sesión sigue activa**, se re-entra sola.
- **No se guarda el PIN ni ningún hash.** Es el mismo nivel de confianza que ya tiene la app
  (LAN local, sin tokens, `user.id` viaja en el body). Si la sesión ya no existe o está
  cerrada, se limpia y se cae al dashboard.
- Logout borra ambas claves.

### 2.3 Vista TV = espectador de solo lectura, sin login

- **URL:** `http://<ip-del-DM>:3000/#/tv/<sessionId>` — se abre **antes** del gate de login.
  (El puerto 3000 es el publicado por `docker-compose.yml` para el servicio `frontend`.)
- **Backend:** un handler nuevo `session:spectate` / `session:unspectate` que solo hace
  `socket.join('session:<id>')`. **No** registra `session_members`, **no** escribe en
  `session_events`, **no** aparece en la lista de presencia. El televisor es invisible para
  la mesa y para las estadísticas.
- **Datos:** cero endpoints REST nuevos. La vista compone lo que ya existe:
  `GET /sessions/:id`, `GET /characters/session/:id`, `GET /sessions/:id/events`,
  `GET /canvas/:id`, y el `chat:history` del socket.
- **Realtime:** ya está todo emitido a la room — `session:event_fired`, `characters:updated`,
  `characters:list_updated`, `canvas:image_changed`, `session:users`, `chat:message`,
  `session:closed`, `session:reset`. La TV solo escucha.

**Compromiso de seguridad (explícito):** cualquiera en la LAN que sepa el id puede *ver* la
sesión sin PIN. Es una app local-first para una mesa de amigos y ya no hay tokens en ninguna
parte; el modo TV es **estrictamente de lectura** (no emite nada salvo el join) y solo sirve
sesiones `status='active'`. Si algún día se quiere endurecer, el punto de control es un
`spectate_token` por sesión — se deja documentado, no implementado.

### 2.4 Qué se ve en la TV (jerarquía de lectura a 3 metros)

La pantalla se lee de lejos: tipografías grandes, contraste alto, cero controles.

```
┌──────────────────────────────────────────────────────────────────────┐
│  [DEMO] Asedio de la Torre        Honor · Stormlight RPG    ● 02:14  │  cabecera 
├───────────────────────────────────────────┬──────────────────────────┤
│                                           │  LA PARTIDA              │
│                                           │  ┌────────────────────┐  │
│         MAPA / ESCENA ACTUAL              │  │ Talani        ● on │  │
│         (imagen compartida del canvas)    │  │ ●●●●●○○○  PV 5/8   │  │
│                                           │  │ ●●●●●●●●  Vol 8/8  │  │
│    · si no hay imagen: tarjeta grande     │  └────────────────────┘  │
│      del ÚLTIMO EVENTO disparado          │  ┌────────────────────┐  │
│      (título + categoría + descripción)   │  │ Buenatracio   ○ off│  │
│                                           │  │ ●●●○○○○○  PV 3/8   │  │
│                                           │  └────────────────────┘  │
├───────────────────────────────────────────┴──────────────────────────┤
│  ▸ Emboscada en el puente   ▸ Persecución   ▸ Refugio   (últimos 5)   │  franja
└──────────────────────────────────────────────────────────────────────┘
   Únete desde tu móvil:  http://192.168.1.42:3000          ← pie discreto
```

- **Vitales:** se derivan de los atributos `is_core || has_max` del sistema (la misma regla
  que usa `StatusTab` de la ficha), así que funciona para Stormlight, Dragonbane o lo que
  venga — **cero hardcode de "HP"**. Puntos si `max <= 20`, barra si es mayor.
- **Último evento:** entra con un realce breve (borde de categoría) para que la mesa note que
  "pasó algo". Sin animaciones que distraigan.
- **Pie con la URL de entrada:** `window.location.origin` — la TV enseña a los jugadores
  cómo entrar sin que el DM dicte la IP. Esto es literalmente "dejarlo más en línea".
- **Reloj de sesión:** tiempo transcurrido desde `session.created_at`.
- **Cierre:** al recibir `session:closed`, la TV muestra el estado final en vez de romperse.

### 2.5 Cómo se llega a la vista TV

- Botón **"Modo TV"** en la toolbar de la sesión (DM) → abre `#/tv/<id>` en **pestaña nueva**
  (`target="_blank"`), para que el DM conserve su panel de control en la pantalla principal
  y arrastre la pestaña nueva al televisor.
- La URL también se puede teclear directamente en el navegador de la TV / Chromecast.

---

## 3. Alcance de F31 (y lo que queda fuera)

**Dentro:**
1. `lib/route.js` (helper puro + hook) y cableado en `App.jsx`.
2. Persistencia de `user`/`sessionId` en `localStorage` + auto-rejoin.
3. `pages/TvView.jsx` + subcomponentes de presentación.
4. `session:spectate` / `session:unspectate` en `backend/src/sockets/session.js`.
5. Botón "Modo TV" en `SessionToolbar` (solo DM).
6. Tests: helpers puros (`parseHash`, `buildRoute`, `pickVitals`) + SSR de la vista + test del
   handler de socket con el `io` falso que ya usa `canvas.test.js`.

**Fuera (deliberado, para no inflar):**
- Iniciativa/turnos en la TV (no existe el concepto en el modelo).
- QR de la URL (necesitaría dependencia nueva; la URL en texto grande basta).
- Tokens de espectador.
- Presentar el grafo de planificación en la TV (es información del DM, no de la mesa).

---

## 4. Nota práctica de LAN (acción del founder, no de código)

`docker-compose.yml` publica el frontend en `0.0.0.0:3000`, así que la app **ya** es
alcanzable desde cualquier móvil/TV de la red — siempre que **el Firewall de Windows
permita el puerto 3000** para la red privada. Si los jugadores no cargan la página, ese es
el primer sitio donde mirar (no es un bug de la app). La IP del DM se ve con `ipconfig`.

---

## 5. Ideas para después (no implementadas)

- **`spectate_token` por sesión** si alguna vez la LAN deja de ser de confianza.
- **Tirador de dados compartido** que emita a la room y se vea en la TV: es la pieza que más
  "mesa en vivo" añadiría y hoy no existe en el modelo (no hay tabla de tiradas).
- **Modo TV para la sesión cerrada** (repaso de la partida: resumen IA + timeline) reusando
  `SessionDetail`.
- **PWA / instalable** en el móvil de los jugadores (manifest + service worker) — con las
  rutas por hash ya en su sitio, es un paso pequeño.
