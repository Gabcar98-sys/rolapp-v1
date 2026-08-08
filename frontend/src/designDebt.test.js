import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Guardia contra la regresión SILENCIOSA de los alias v0 (F35) ─────────────
// F35 retiró de tailwind.config.js los alias de la paleta v0 (el dorado y las
// sombras oscuras/línea del gris "ink"). Volver a escribir una de esas clases NO
// rompe el build: Tailwind simplemente no la genera y el elemento queda sin color.
// Es decir, la regresión sólo se ve mirando la app. Este test convierte ese fallo
// invisible en un test rojo censando el árbol en cada `npm test`.
// (Nota de método, lección del falso negativo de F32: aquí no hay locale de por
// medio — el censo lo hace JS sobre el contenido real de los archivos.)
//
// OJO: en este archivo NINGUNA clase v0 se escribe literal (las muestras del
// control positivo se componen en runtime) para que un `grep` del árbol siga
// devolviendo cero y nadie confunda este test con un consumidor vivo.

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

// Clases con FORMA de utilidad Tailwind (prefijo-color). Deja pasar `text-ink`
// (el DEFAULT, que sí se conserva) y la cadena de datos 'gold' de catalog.js.
const V0_CLASS =
  /\b(?:bg|text|border|ring|divide|from|via|fill|stroke|outline|shadow|placeholder|decoration)-(?:gold(?:-(?:soft|dim))?|ink-(?:900|800|700|600|500|line)|gray-\d{2,3})\b/u;

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

const SCANNED_EXT = /\.(?:jsx?|css)$/;
const IS_TEST = /\.test\.[jt]sx?$/;

// Archivos que F35 migró a los tokens del handoff (aquí no debe volver un emoji).
// F36 borró 'pages/MyCharacters.jsx' de esta lista junto con el archivo: era un
// huérfano (cero imports desde F13) y F35 lo migró sin saberlo. El censo general
// de V0_CLASS de abajo recorre todo src/, así que no se pierde cobertura real.
const F35_FILES = [
  'components/Stats/CampaignStatsPanel.jsx',
  'components/Stats/CharacterStatsPanel.jsx',
  'components/Stats/Sparkline.jsx',
];

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (SCANNED_EXT.test(entry.name) && !IS_TEST.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('deuda visual v0 (F35)', () => {
  const files = collectSourceFiles(SRC_DIR);

  it('el censo recorre un árbol de fuentes no vacío (si no, el test no probaría nada)', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('detecta de verdad una clase v0 (control positivo del patrón)', () => {
    // Compuestas en runtime a propósito: ver la nota de cabecera.
    const shade = 900;
    for (const sample of [
      `bg-ink-${shade}`,
      `border-ink-${'line'}`,
      `text-${'gray'}-100`,
      `focus:border-${'gold'}`,
    ]) {
      expect(sample).toMatch(V0_CLASS);
    }
    expect(V0_CLASS.test('text-ink')).toBe(false); // el DEFAULT conservado no es deuda
    expect(V0_CLASS.test('bg-surface text-title border-line')).toBe(false); // tokens del handoff
  });

  it('ningún archivo de src/ usa los alias retirados (gold / ink-* / gray-*)', () => {
    const offenders = files
      .filter((f) => V0_CLASS.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC_DIR, f).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('los archivos migrados en F35 no contienen emojis (sólo iconos de Icon.jsx)', () => {
    const offenders = F35_FILES.filter((rel) => EMOJI.test(readFileSync(join(SRC_DIR, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
