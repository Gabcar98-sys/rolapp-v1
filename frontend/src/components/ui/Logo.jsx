// Logo de la app: cubo isométrico de línea sobre cuadrado terracota 30px (handoff).
// Compartido por el sidebar y el Login.
export default function Logo() {
  return (
    <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-accent">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1B1815"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2l8.5 5v10L12 22 3.5 17V7z" />
        <path d="M12 2v20M3.5 7L12 12l8.5-5M3.5 17L12 12l8.5 5" />
      </svg>
    </div>
  );
}
