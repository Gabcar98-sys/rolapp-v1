/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ── Tokens de diseño (identidad oscura/dorada heredada de la v0) ──
      colors: {
        gold: {
          DEFAULT: '#c9a84c',
          soft: '#d8bd6b',
          dim: '#9d8238',
        },
        ink: {
          900: '#0a1422', // fondos más profundos
          800: '#0d1f35',
          700: '#16213e', // superficies / paneles
          600: '#0f3460', // acentos azules
          500: '#1a2a4a',
          line: '#2a2a4a', // bordes
        },
        danger: '#c0392b',
        success: '#1a5c2e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
  plugins: [],
};
