/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ── Tokens del handoff de diseño (.claude/design_handoff_rolapp/README.md) ──
      // Modo oscuro cálido, editorial. Acento terracota.
      colors: {
        // Fondos
        bg: '#1B1815', // fondo de la app
        rail: '#17140F', // rail compacto (Preparar Sesión)
        nav: '#201D18', // sidebar
        surface: {
          DEFAULT: '#221E19', // tarjetas / paneles
          2: '#262119',
        },
        hover: {
          DEFAULT: '#26221C', // superficie hover
          2: '#282420', // hover de ítems de nav
        },
        // Bordes
        line: {
          DEFAULT: '#2E2A24',
          2: '#2A2620',
          hover: '#4A4237',
        },
        // Texto
        title: {
          DEFAULT: '#F4EFE6', // títulos (serif)
          2: '#F1ECE2',
        },
        sub: '#B4AB9D', // texto secundario
        faint: '#8A8175', // texto terciario / labels
        muted: {
          DEFAULT: '#6E6659', // labels uppercase
          2: '#7C7468',
        },
        idle: '#ACA396', // ítems de nav en reposo
        // Acento terracota
        accent: {
          DEFAULT: '#CE6A3A',
          hover: '#D97C4E',
          text: '#E08A5C', // acento sobre oscuro (texto/iconos)
          tint: '#33251C', // tinte de fondo (selección nav)
        },
        // Peligro / eliminar
        danger: {
          DEFAULT: '#c0392b', // alias v0 (banners de error existentes)
          text: '#E4785E',
          tint: '#3A231F',
          idle: '#C0796E', // "Cerrar Sesión" en reposo
          wash: '#2E2020', // fondo hover del pie del sidebar
        },
        success: '#1a5c2e',
        // Colores de categoría (eventos, habilidades, items, atributos)
        cat: {
          combat: { text: '#E79B72', bg: '#38241B', bar: '#D2703F' },
          social: { text: '#CFA0BF', bg: '#312330', bar: '#9E7890' },
          explore: { text: '#9DC08B', bg: '#22301E', bar: '#7C9668' },
          discovery: { text: '#DBB55F', bg: '#332B17', bar: '#C9A24A' },
          extra: { text: '#A9AEC9', bg: '#2A2A33' },
        },
        // ── Alias temporales de la paleta v0 (solo para vistas aún no rediseñadas;
        // F14-F19 las migran y luego estos alias se eliminan). Mapean a tonos cálidos
        // equivalentes para que las vistas viejas no desentonen dentro del shell. ──
        gold: {
          DEFAULT: '#CE6A3A',
          soft: '#E08A5C',
          dim: '#A8663F',
        },
        ink: {
          DEFAULT: '#ECE6DB', // texto principal (token nuevo)
          900: '#1B1815',
          800: '#17140F',
          700: '#221E19',
          600: '#26221C',
          500: '#262119',
          line: '#2E2A24',
        },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '13px', // tarjetas / paneles
        btn: '9px', // botones e inputs
        pill: '20px', // badges / píldoras
      },
      boxShadow: {
        card: '0 6px 20px rgba(0,0,0,.28)', // hover de tarjeta
        node: '0 10px 26px rgba(0,0,0,.5)', // nodo seleccionado (grafo)
      },
    },
  },
  plugins: [],
};
