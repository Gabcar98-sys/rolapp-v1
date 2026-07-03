// Contenedor estándar de página dentro del AppShell: padding 34px 40px 60px
// y max-width ~1080px (handoff). Mobile-first: padding reducido en pantallas chicas.
export default function Page({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-[1080px] px-5 pb-[60px] pt-6 md:px-10 md:pt-[34px] ${className}`}>
      {children}
    </div>
  );
}
