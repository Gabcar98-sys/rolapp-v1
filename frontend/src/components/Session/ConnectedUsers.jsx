// Lista de usuarios conectados a la sesión (presencia en tiempo real).
export default function ConnectedUsers({ users = [] }) {
  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        Jugadores en sesión ({users.length})
      </h3>
      {users.length === 0 ? (
        <p className="text-sm italic text-faint">Esperando jugadores…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.userId}
              className="flex items-center gap-3 rounded-btn bg-surface-2 px-3 py-2"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface font-bold text-accent-text">
                {u.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="flex-1 text-sm font-medium text-title">
                {u.username}
                {u.role === 'dm' && (
                  <span className="ml-2 rounded-pill bg-accent px-1.5 py-0.5 text-[0.65rem] font-bold text-bg">
                    DM
                  </span>
                )}
              </span>
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full bg-success"
                title="Conectado"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
