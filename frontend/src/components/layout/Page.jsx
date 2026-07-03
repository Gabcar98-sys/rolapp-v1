// Contenedor estándar de página dentro del AppShell: padding 34px 40px 60px
// y max-width ~1080px (handoff). Mobile-first: padding reducido en pantallas chicas.
// maxWidthClass permite anchos alternativos (p. ej. el timeline de 920px) sin
// competir con la clase por defecto dentro del mismo atributo class.
export default function Page({ children, className = '', maxWidthClass = 'max-w-[1080px]' }) {
  return (
    <div className={`mx-auto w-full ${maxWidthClass} px-5 pb-[60px] pt-6 md:px-10 md:pt-[34px] ${className}`}>
      {children}
    </div>
  );
}
