// Encabezado estándar de página: H1 en Newsreader + subtítulo secundario.
export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-[26px] font-semibold leading-tight text-title md:text-[32px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
