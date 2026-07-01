import { useCallback, useEffect, useMemo, useState } from 'react';
import socket from '../../lib/socket.js';
import { api } from '../../lib/api.js';
import { categoryClasses, isPlanningEvent, EVENT_CATEGORIES } from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Tabs from '../ui/Tabs.jsx';
import EventFlowGraph from '../DMMaster/EventFlowGraph.jsx';

// Panel de planificación en sesión (solo DM). Carga la jerarquía del prep de la sesión
// (o event_templates sueltos) y permite disparar eventos al log append-only de la sesión.
// La lógica de "inicio / próximo" por sub-ubicación se porta de la v0 (useMemo subLocFlows).
export default function PlanningPanel({ sessionId, user, session }) {
  const [hierarchy, setHierarchy] = useState(null); // { locations, freeEvents }
  const [eventLinks, setEventLinks] = useState([]);
  const [allEventsMap, setAllEventsMap] = useState(new Map());
  const [templates, setTemplates] = useState([]);
  const [firedEvents, setFiredEvents] = useState([]);
  const [firedTemplateIds, setFiredTemplateIds] = useState(new Set());
  const [firedIds, setFiredIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(null);
  const [tab, setTab] = useState('plan');
  const [error, setError] = useState('');

  const [sessionChars, setSessionChars] = useState([]);

  // Modal de participantes al lanzar un evento.
  const [pendingFire, setPendingFire] = useState(null);
  const [partType, setPartType] = useState('all');
  const [partSelected, setPartSelected] = useState(new Set());

  // Modal de evento NPC.
  const [showNpcModal, setShowNpcModal] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [npcForm, setNpcForm] = useState({ npc_id: '', category: 'general', title: '', description: '' });
  const [npcFiring, setNpcFiring] = useState(false);

  // Recarga la jerarquía del prep (o las plantillas sueltas) y reconstruye el mapa
  // de eventos. Se usa al montar y tras editar el flujo desde el editor visual, para
  // que las vistas de inicio/próximos reflejen los cambios al instante.
  const reloadPrep = useCallback(async () => {
    if (session?.prep_id) {
      const data = await api.getPrep(session.prep_id);
      const locs = data.locations ?? [];
      const free = data.freeEvents ?? [];
      setHierarchy({ locations: locs, freeEvents: free });
      setEventLinks(data.eventLinks ?? []);

      // Mapa id → { event, locName, subLocName }, recorriendo ramas.
      const map = new Map();
      const recurse = (evts, locName, subLocName) => {
        for (const e of evts) {
          map.set(e.id, { event: e, locName, subLocName });
          if (e.branches?.length) recurse(e.branches, locName, subLocName);
        }
      };
      for (const loc of locs) {
        for (const sub of loc.sub_locations ?? []) recurse(sub.events ?? [], loc.name, sub.name);
      }
      recurse(free, '', '');
      setAllEventsMap(map);
    } else {
      const data = await api.listEventTemplates(user.id, session?.campaign_id ?? null);
      setTemplates(data.templates ?? []);
    }
  }, [session?.prep_id, session?.campaign_id, user.id]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const { events } = await api.listEvents(sessionId);
        const fired = (events ?? []).filter(isPlanningEvent);
        if (!active) return;
        // El log viene cronológico ascendente; en "Disparados" mostramos lo más reciente arriba.
        setFiredEvents([...fired].reverse());

        // Reconstruye el estado "disparado" desde el payload del log.
        const recoveredTmplIds = new Set();
        const recoveredFiredIds = new Set();
        for (const e of fired) {
          try {
            const p = JSON.parse(e.payload);
            if (p.template_id) {
              recoveredTmplIds.add(Number(p.template_id));
              recoveredFiredIds.add(`${p.template_id}-${p.branch_label ?? ''}`);
            }
          } catch {
            // payload no parseable: se ignora sin romper la reconstrucción.
          }
        }
        setFiredTemplateIds(recoveredTmplIds);
        setFiredIds(recoveredFiredIds);

        await reloadPrep();
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    // Personajes de la sesión (selector de participantes específicos).
    api
      .getSession(sessionId)
      .then(({ characters }) => active && setSessionChars((characters ?? []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});

    // NPCs del DM (modal de evento NPC).
    if (user?.id) {
      api
        .listNpcs(user.id)
        .then(({ npcs: list }) => active && setNpcs(list ?? []))
        .catch(() => {});
    }

    const onEvent = ({ event }) => {
      if (event && isPlanningEvent(event)) setFiredEvents((prev) => [event, ...prev]);
    };
    socket.on('session:event_fired', onEvent);

    return () => {
      active = false;
      socket.off('session:event_fired', onEvent);
    };
  }, [sessionId, session?.prep_id, session?.campaign_id, user?.id, reloadPrep]);

  function openFire(tmpl, branchLabel = '', locationName = '', subLocationName = '') {
    setPendingFire({ tmpl, branchLabel, locationName, subLocationName });
    setPartType('all');
    setPartSelected(new Set());
  }

  async function confirmFireEvent() {
    const { tmpl, branchLabel, locationName, subLocationName } = pendingFire;
    const key = `${tmpl.id}-${branchLabel}`;
    setFiring(key);
    setError('');
    const participants =
      partType === 'specific'
        ? sessionChars.filter((c) => partSelected.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
        : [];
    try {
      await api.firePlanningEvent(sessionId, {
        dm_id: user.id,
        title: branchLabel ? `${branchLabel}: ${tmpl.title}` : tmpl.title,
        category: tmpl.category,
        description: tmpl.description,
        participant_type: partType,
        participants,
        location: locationName,
        sub_location: subLocationName,
        branch_label: branchLabel,
        template_id: tmpl.id,
      });
      setFiredIds((prev) => new Set(prev).add(key));
      setFiredTemplateIds((prev) => new Set(prev).add(tmpl.id));
      setPendingFire(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setFiring(null);
    }
  }

  async function fireNpcEvent() {
    if (!npcForm.title || !npcForm.npc_id) {
      setError('Selecciona un NPC y escribe el título');
      return;
    }
    setNpcFiring(true);
    setError('');
    const selectedNpc = npcs.find((n) => String(n.id) === String(npcForm.npc_id));
    try {
      await api.firePlanningEvent(sessionId, {
        dm_id: user.id,
        title: npcForm.title,
        category: npcForm.category,
        description: npcForm.description,
        actor_type: 'npc',
        npc_id: npcForm.npc_id,
        npc_name: selectedNpc?.name ?? '',
        participant_type: 'all',
        participants: [],
      });
      setShowNpcModal(false);
      setNpcForm({ npc_id: '', category: 'general', title: '', description: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setNpcFiring(false);
    }
  }

  // ── Flujos independientes por sub-ubicación (inicio + próximos según links) ──
  const { subLocFlows, hasLinks } = useMemo(() => {
    if (!hierarchy) return { subLocFlows: [], hasLinks: false };

    const linksExist = eventLinks.length > 0;
    const flows = [];

    for (const loc of hierarchy.locations) {
      for (const sub of loc.sub_locations ?? []) {
        // IDs de eventos que pertenecen a esta sub-ubicación.
        const eventIds = new Set();
        for (const [id, entry] of allEventsMap) {
          if (entry.locName === loc.name && entry.subLocName === sub.name) eventIds.add(id);
        }
        if (eventIds.size === 0) continue;

        const subLinks = eventLinks.filter(
          (l) => eventIds.has(l.from_event_id) && eventIds.has(l.to_event_id)
        );
        const incomingInSub = new Set(subLinks.map((l) => l.to_event_id));

        // Eventos raíz: sin enlace entrante en la sub-ubicación y que no son ramas.
        const initialEntries = [...eventIds]
          .filter((id) => !incomingInSub.has(id))
          .map((id) => allEventsMap.get(id))
          .filter((e) => e && !e.event.parent_event_id);

        const subFired = new Set([...firedTemplateIds].filter((id) => eventIds.has(id)));

        if (subFired.size === 0) {
          flows.push({ locName: loc.name, subLocName: sub.name, mode: 'initial', initialEntries, nextEntries: [] });
          continue;
        }

        // Hoja disparada = sin sucesor disparado dentro de la sub-ubicación.
        const leafFiredIds = new Set();
        for (const firedId of subFired) {
          const hasFiredSuccessor = subLinks.some(
            (l) => l.from_event_id === firedId && subFired.has(l.to_event_id)
          );
          if (!hasFiredSuccessor) leafFiredIds.add(firedId);
        }

        // Próximos = enlazados desde una hoja disparada y aún no disparados.
        const seen = new Set();
        const nextEntries = [];
        for (const link of subLinks) {
          if (leafFiredIds.has(link.from_event_id) && !subFired.has(link.to_event_id)) {
            if (!seen.has(link.to_event_id)) {
              seen.add(link.to_event_id);
              const entry = allEventsMap.get(link.to_event_id);
              if (entry) nextEntries.push({ ...entry, linkLabel: link.label });
            }
          }
        }

        flows.push({ locName: loc.name, subLocName: sub.name, mode: 'active', initialEntries, nextEntries });
      }
    }

    return { subLocFlows: flows, hasLinks: linksExist };
  }, [allEventsMap, eventLinks, firedTemplateIds, hierarchy]);

  // ── Subcomponentes ───────────────────────────────────────────────────────────
  function FireButton({ tmpl, branchLabel = '', locationName = '', subLocationName = '' }) {
    const key = `${tmpl.id}-${branchLabel}`;
    const busy = firing === key;
    const done = firedIds.has(key);
    return (
      <Button
        size="sm"
        variant={done ? 'success' : 'primary'}
        className="flex-shrink-0 whitespace-nowrap"
        disabled={busy}
        onClick={() => openFire(tmpl, branchLabel, locationName, subLocationName)}
      >
        {busy ? '⏳' : done ? '✅ Lanzado' : '🎯 Lanzar'}
      </Button>
    );
  }

  function EventCard({ event, locName = '', subLocName = '', linkLabel = '' }) {
    const cls = categoryClasses(event.category);
    return (
      <div className="flex gap-2 rounded-md border border-ink-line bg-ink-800 p-2">
        <div className={`w-1 flex-shrink-0 rounded-sm border-l-2 ${cls}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {linkLabel && (
            <span className="text-[0.66rem] font-bold uppercase tracking-wide text-gold">→ {linkLabel}</span>
          )}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="text-sm text-gray-100">{event.title}</strong>
                <span className={`rounded border px-1.5 text-[0.66rem] ${cls}`}>{event.category}</span>
                {(subLocName || locName) && (
                  <span className="text-[0.65rem] text-gray-500">📌 {subLocName || locName}</span>
                )}
              </div>
              {event.description && (
                <p className="mt-0.5 text-xs leading-snug text-gray-400">{event.description}</p>
              )}
            </div>
            <FireButton tmpl={event} locationName={locName} subLocationName={subLocName} />
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'plan', label: '📋 Prep.' },
    { id: 'fired', label: `⚡ Disparados`, badge: firedEvents.length },
    // Edición visual del flujo en vivo: requiere un prep asociado a la sesión.
    ...(session?.prep_id ? [{ id: 'edit', label: '🕸 Editar' }] : []),
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs tabs={tabs} activeId={tab} onChange={setTab} className="flex-shrink-0" />

      {error && (
        <p className="mx-2 mt-2 rounded-md bg-danger/20 px-2 py-1 text-xs text-red-300">{error}</p>
      )}

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {loading && <p className="mt-2 text-center text-sm italic text-gray-600">Cargando…</p>}

        {/* ── Pestaña Preparación ── */}
        {!loading && tab === 'plan' && (
          <>
            {/* Vista con flujo (prep + enlaces): por sub-ubicación */}
            {hierarchy && hasLinks && (
              <>
                {subLocFlows.length === 0 && (
                  <p className="mt-2 text-center text-sm italic text-gray-600">
                    Sin eventos en esta preparación.
                  </p>
                )}
                {subLocFlows.map(({ locName, subLocName, mode, initialEntries, nextEntries }) => (
                  <div key={`${locName}|||${subLocName}`} className="mb-1 flex flex-col gap-1">
                    <div className="rounded bg-ink-700 px-2 py-1 text-sm font-bold text-gold">📍 {locName}</div>
                    <div className="px-1 text-xs font-semibold text-gray-300">📌 {subLocName}</div>

                    <span className="self-start rounded bg-ink-900 px-1.5 py-0.5 text-[0.69rem] font-bold text-gold">
                      🚀 Inicio
                    </span>
                    {initialEntries.length === 0 ? (
                      <p className="text-xs italic text-gray-600">Sin eventos de inicio definidos.</p>
                    ) : (
                      initialEntries.map(({ event, locName: l, subLocName: sl }) => (
                        <EventCard key={event.id} event={event} locName={l} subLocName={sl} />
                      ))
                    )}

                    {mode === 'active' && (
                      <>
                        <span className="self-start rounded bg-success/20 px-1.5 py-0.5 text-[0.69rem] font-bold text-emerald-400">
                          🎯 Próximo
                        </span>
                        {nextEntries.length === 0 ? (
                          <p className="text-xs italic text-gray-600">Camino completado en esta ubicación.</p>
                        ) : (
                          nextEntries.map(({ event, locName: l, subLocName: sl, linkLabel }) => (
                            <EventCard key={event.id} event={event} locName={l} subLocName={sl} linkLabel={linkLabel} />
                          ))
                        )}
                      </>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Vista jerárquica (prep sin enlaces) */}
            {hierarchy && !hasLinks && (
              <>
                {hierarchy.locations.length === 0 && hierarchy.freeEvents.length === 0 && (
                  <p className="mt-2 text-center text-sm italic text-gray-600">
                    Sin eventos en esta preparación.
                  </p>
                )}
                {hierarchy.locations.map((loc) => (
                  <div key={loc.id} className="mb-1 flex flex-col gap-1">
                    <div className="rounded bg-ink-700 px-2 py-1 text-sm font-bold text-gold">📍 {loc.name}</div>
                    {(loc.sub_locations ?? []).map((sub) => (
                      <div key={sub.id} className="flex flex-col gap-1 pl-2">
                        <div className="px-1 text-xs font-semibold text-gray-300">📌 {sub.name}</div>
                        {(sub.events ?? []).length === 0 ? (
                          <p className="text-xs italic text-gray-600">Sin eventos.</p>
                        ) : (
                          (sub.events ?? []).map((evt) => (
                            <EventCard key={evt.id} event={evt} locName={loc.name} subLocName={sub.name} />
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {hierarchy.freeEvents.length > 0 && (
                  <div className="mb-1 flex flex-col gap-1">
                    <div className="rounded bg-ink-700 px-2 py-1 text-sm font-bold text-gold">📋 Sin ubicación</div>
                    {hierarchy.freeEvents.map((evt) => (
                      <EventCard key={evt.id} event={evt} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Vista plana (sin prep) */}
            {!hierarchy && (
              <>
                {templates.length === 0 ? (
                  <p className="mt-2 whitespace-pre-line text-center text-sm italic leading-relaxed text-gray-600">
                    {'Sin eventos preparados.\nCrea una preparación desde el Lobby (Constructor de prep.).'}
                  </p>
                ) : (
                  templates.map((tmpl) => <EventCard key={tmpl.id} event={tmpl} />)
                )}
              </>
            )}
          </>
        )}

        {/* ── Pestaña Disparados ── */}
        {!loading && tab === 'fired' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="self-start border-orange-400 text-orange-400 hover:text-orange-300"
              onClick={() => {
                setShowNpcModal(true);
                setError('');
              }}
            >
              👤 Nuevo Evento NPC
            </Button>

            {firedEvents.length === 0 && (
              <p className="mt-2 text-center text-sm italic text-gray-600">
                Sin eventos disparados en esta sesión.
              </p>
            )}
            {firedEvents.map((evt, i) => {
              let payload = {};
              try {
                payload = JSON.parse(evt.payload);
              } catch {
                payload = {};
              }
              const cls = categoryClasses(evt.type);
              const isNpc = payload.actor_type === 'npc';
              const hasSpecific =
                payload.participant_type === 'specific' &&
                Array.isArray(payload.participants) &&
                payload.participants.length > 0;
              return (
                <div
                  key={evt.id ?? i}
                  className={`flex flex-col gap-1 rounded-md border bg-ink-900 p-2 ${
                    isNpc ? 'border-l-2 border-orange-400' : 'border-ink-line'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isNpc && (
                      <span className="rounded border border-orange-400 px-1.5 text-[0.66rem] text-orange-400">
                        👤 NPC
                      </span>
                    )}
                    <span className={`rounded border px-1.5 text-[0.66rem] ${cls}`}>{evt.type}</span>
                    <span className="text-sm font-semibold text-gray-300">{payload.title || evt.type}</span>
                  </div>
                  {payload.description && (
                    <p className="text-xs leading-snug text-gray-400">{payload.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.68rem] text-gray-600">
                      {isNpc ? `👤 ${payload.npc_name || 'NPC'}` : evt.actor_username || 'sistema'}
                    </span>
                    {hasSpecific && (
                      <span className="text-[0.68rem] text-blue-300">
                        Solo: {payload.participants.map((p) => p.name ?? p).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ── Pestaña Editar flujo (grafo visual en vivo, solo DM) ── */}
        {!loading && tab === 'edit' && hierarchy && (
          <div className="flex min-h-[60vh] flex-1 flex-col">
            <EventFlowGraph
              locations={hierarchy.locations}
              freeEvents={hierarchy.freeEvents}
              eventLinks={eventLinks}
              dmId={user.id}
              prepId={session.prep_id}
              onChange={reloadPrep}
              compact
            />
          </div>
        )}
      </div>

      {/* ── Modal de participantes ── */}
      <Modal open={!!pendingFire} onClose={() => setPendingFire(null)} title="¿Quién participa?">
        {pendingFire && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-300">
              <strong className="text-gray-100">{pendingFire.tmpl.title}</strong>
            </p>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input
                  type="radio"
                  checked={partType === 'all'}
                  onChange={() => {
                    setPartType('all');
                    setPartSelected(new Set());
                  }}
                />
                <span>Todo el grupo</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input type="radio" checked={partType === 'specific'} onChange={() => setPartType('specific')} />
                <span>Específicos</span>
              </label>
            </div>
            {partType === 'specific' && (
              <div className="flex max-h-36 flex-col gap-2 overflow-y-auto">
                {sessionChars.length === 0 && (
                  <p className="text-xs italic text-gray-600">Sin personajes en sesión.</p>
                )}
                {sessionChars.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={partSelected.has(c.id)}
                      onChange={() =>
                        setPartSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingFire(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmFireEvent} disabled={!!firing}>
                {firing ? '⏳' : '🎯 Lanzar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal de evento NPC ── */}
      <Modal open={showNpcModal} onClose={() => setShowNpcModal(false)} title="👤 Nuevo Evento NPC">
        <div className="flex flex-col gap-2.5">
          <select
            value={npcForm.npc_id}
            onChange={(e) => setNpcForm((f) => ({ ...f, npc_id: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            <option value="">— Seleccionar NPC —</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.avatar_icon} {n.name}
              </option>
            ))}
          </select>
          <select
            value={npcForm.category}
            onChange={(e) => setNpcForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={npcForm.title}
            onChange={(e) => setNpcForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <textarea
            value={npcForm.description}
            onChange={(e) => setNpcForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="min-h-[60px] resize-y rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowNpcModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-orange-500 text-ink-900 hover:opacity-90"
              onClick={fireNpcEvent}
              disabled={npcFiring}
            >
              {npcFiring ? '⏳' : '👤 Crear Evento'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
