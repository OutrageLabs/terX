/**
 * Konwertuje themes z Ghostty do formatu terX
 *
 * Uruchom: bun run scripts/convert-ghostty-themes.ts
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const GHOSTTY_THEMES_PATH = '/Users/k/dev/ghostty/zig-out/share/ghostty/themes';

// Istniejące themes w terX (pomijamy je) - używamy oryginalnych nazw plików z Ghostty
const EXISTING_THEMES = new Set([
  'Catppuccin Mocha',
  'Catppuccin Latte',
  'Dracula',  // Nie Dracula+!
  'Nord',
  'Gruvbox Dark',
  'Gruvbox Light',
  'Tokyo Night',
  'One Dark',  // lub 'Atom One Dark'
  'Solarized Dark',
  'Solarized Light',
]);

interface GhosttyTheme {
  palette: string[];
  background: string;
  foreground: string;
  cursorColor?: string;
  cursorText?: string;
  selectionBackground?: string;
  selectionForeground?: string;
}

// Parsuj plik theme ghostty
function parseGhosttyTheme(content: string): GhosttyTheme {
  const lines = content.split('\n');
  const palette: string[] = new Array(16).fill('#000000');
  let background = '#1e1e1e';
  let foreground = '#d4d4d4';
  let cursorColor: string | undefined;
  let cursorText: string | undefined;
  let selectionBackground: string | undefined;
  let selectionForeground: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\S+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    const cleanValue = value.trim();

    if (key === 'palette') {
      const paletteMatch = cleanValue.match(/^(\d+)=(#[0-9a-fA-F]{6})$/);
      if (paletteMatch) {
        const idx = parseInt(paletteMatch[1], 10);
        if (idx >= 0 && idx < 16) {
          palette[idx] = paletteMatch[2];
        }
      }
    } else if (key === 'background') {
      background = cleanValue;
    } else if (key === 'foreground') {
      foreground = cleanValue;
    } else if (key === 'cursor-color') {
      cursorColor = cleanValue;
    } else if (key === 'cursor-text') {
      cursorText = cleanValue;
    } else if (key === 'selection-background') {
      selectionBackground = cleanValue;
    } else if (key === 'selection-foreground') {
      selectionForeground = cleanValue;
    }
  }

  return { palette, background, foreground, cursorColor, cursorText, selectionBackground, selectionForeground };
}

// Hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

// RGB to Hex
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

// Rozjaśnij/przyciemnij kolor
function adjustBrightness(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (factor > 0) {
    // Lighten
    return rgbToHex(
      r + (255 - r) * factor,
      g + (255 - g) * factor,
      b + (255 - b) * factor
    );
  } else {
    // Darken
    const f = 1 + factor;
    return rgbToHex(r * f, g * f, b * f);
  }
}

// Sprawdź czy theme jest ciemny
function isDarkTheme(background: string): boolean {
  const { r, g, b } = hexToRgb(background);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// Konwertuj nazwę do ID
function nameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Generuj Theme z GhosttyTheme
function generateTheme(name: string, gt: GhosttyTheme): string {
  const id = nameToId(name);
  const isDark = isDarkTheme(gt.background);

  // Terminal colors
  const cursor = gt.cursorColor || gt.foreground;
  const cursorAccent = gt.cursorText || gt.background;
  const selBg = gt.selectionBackground || adjustBrightness(gt.background, isDark ? 0.3 : -0.2);
  const selFg = gt.selectionForeground || gt.foreground;

  // UI colors - generowane z background
  const base = gt.background;
  const mantle = adjustBrightness(gt.background, isDark ? -0.15 : 0.05);
  const crust = adjustBrightness(gt.background, isDark ? -0.25 : 0.1);
  const surface0 = adjustBrightness(gt.background, isDark ? 0.1 : -0.05);
  const surface1 = adjustBrightness(gt.background, isDark ? 0.15 : -0.1);
  const surface2 = adjustBrightness(gt.background, isDark ? 0.2 : -0.15);
  const overlay0 = adjustBrightness(gt.background, isDark ? 0.35 : -0.25);
  const overlay1 = adjustBrightness(gt.background, isDark ? 0.45 : -0.35);
  const overlay2 = adjustBrightness(gt.background, isDark ? 0.55 : -0.45);
  const text = gt.foreground;
  const subtext0 = adjustBrightness(gt.foreground, isDark ? -0.1 : 0.1);
  const subtext1 = adjustBrightness(gt.foreground, isDark ? -0.2 : 0.2);

  // ANSI colors
  const black = gt.palette[0];
  const red = gt.palette[1];
  const green = gt.palette[2];
  const yellow = gt.palette[3];
  const blue = gt.palette[4];
  const magenta = gt.palette[5];
  const cyan = gt.palette[6];
  const white = gt.palette[7];
  const brightBlack = gt.palette[8];
  const brightRed = gt.palette[9];
  const brightGreen = gt.palette[10];
  const brightYellow = gt.palette[11];
  const brightBlue = gt.palette[12];
  const brightMagenta = gt.palette[13];
  const brightCyan = gt.palette[14];
  const brightWhite = gt.palette[15];

  // Escape name for string
  const escapedName = name.replace(/"/g, '\\"');

  return `  {
    id: "${id}",
    name: "${escapedName}",
    terminal: {
      name: "${escapedName}",
      background: "${gt.background}",
      foreground: "${gt.foreground}",
      cursor: "${cursor}",
      cursorAccent: "${cursorAccent}",
      selectionBackground: "${selBg}",
      selectionForeground: "${selFg}",
      black: "${black}",
      red: "${red}",
      green: "${green}",
      yellow: "${yellow}",
      blue: "${blue}",
      magenta: "${magenta}",
      cyan: "${cyan}",
      white: "${white}",
      brightBlack: "${brightBlack}",
      brightRed: "${brightRed}",
      brightGreen: "${brightGreen}",
      brightYellow: "${brightYellow}",
      brightBlue: "${brightBlue}",
      brightMagenta: "${brightMagenta}",
      brightCyan: "${brightCyan}",
      brightWhite: "${brightWhite}",
    },
    ui: {
      name: "${escapedName}",
      isDark: ${isDark},
      base: "${base}",
      mantle: "${mantle}",
      crust: "${crust}",
      surface0: "${surface0}",
      surface1: "${surface1}",
      surface2: "${surface2}",
      overlay0: "${overlay0}",
      overlay1: "${overlay1}",
      overlay2: "${overlay2}",
      text: "${text}",
      subtext0: "${subtext0}",
      subtext1: "${subtext1}",
      blue: "${blue}",
      green: "${green}",
      red: "${red}",
      yellow: "${yellow}",
      magenta: "${magenta}",
      cyan: "${cyan}",
      lavender: "${brightBlue}",
      pink: "${brightMagenta}",
    },
  }`;
}

async function main() {
  console.log('Wczytuję themes z Ghostty...');

  const files = await readdir(GHOSTTY_THEMES_PATH);
  console.log(`Znaleziono ${files.length} themes`);

  const themes: string[] = [];
  let skipped = 0;
  let converted = 0;

  for (const file of files.sort()) {
    // Pomiń istniejące (porównanie po nazwie pliku, nie ID)
    if (EXISTING_THEMES.has(file)) {
      skipped++;
      continue;
    }

    try {
      const content = await readFile(join(GHOSTTY_THEMES_PATH, file), 'utf-8');
      const gt = parseGhosttyTheme(content);
      const theme = generateTheme(file, gt);
      themes.push(theme);
      converted++;
    } catch (err) {
      console.error(`Błąd przy ${file}:`, err);
    }
  }

  console.log(`Pominięto: ${skipped} (istniejące)`);
  console.log(`Skonwertowano: ${converted}`);

  // Zapisz do pliku
  const output = `// =============================================================================
// Auto-generated themes from Ghostty (${new Date().toISOString().split('T')[0]})
// Generated by: bun run scripts/convert-ghostty-themes.ts
// =============================================================================

import type { Theme } from './themes';

export const GHOSTTY_THEMES: Theme[] = [
${themes.join(',\n')}
];
`;

  const outputPath = join(process.cwd(), 'src/lib/ghostty-themes.ts');
  await writeFile(outputPath, output);
  console.log(`\nZapisano do: ${outputPath}`);
}

main().catch(console.error);
