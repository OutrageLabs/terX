/**
 * Theme System for terX
 *
 * Provides terminal and UI theming based on Ghostty color schemes.
 * Themes can be changed at runtime without restart.
 */

// =============================================================================
// Terminal Theme Interface (matches ghostty-web Terminal theme)
// =============================================================================

export interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  // ANSI colors
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// =============================================================================
// UI Theme Interface (derived from terminal theme + extras)
// =============================================================================

export interface UITheme {
  name: string;
  isDark: boolean;
  // Base colors
  base: string;      // Main background
  mantle: string;    // Slightly darker
  crust: string;     // Darkest
  // Surface colors
  surface0: string;
  surface1: string;
  surface2: string;
  // Overlay colors
  overlay0: string;
  overlay1: string;
  overlay2: string;
  // Text colors
  text: string;
  subtext0: string;
  subtext1: string;
  // Accent colors (from terminal palette)
  blue: string;
  green: string;
  red: string;
  yellow: string;
  magenta: string;
  cyan: string;
  // Special
  lavender: string;
  pink: string;
}

// =============================================================================
// Combined Theme
// =============================================================================

export interface Theme {
  id: string;
  name: string;
  terminal: TerminalTheme;
  ui: UITheme;
}

// =============================================================================
// Bundled Themes (from Ghostty)
// =============================================================================

export const BUNDLED_THEMES: Theme[] = [
  // Catppuccin Mocha (default dark)
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    terminal: {
      name: "Catppuccin Mocha",
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      cursorAccent: "#1e1e2e",
      selectionBackground: "#585b70",
      selectionForeground: "#cdd6f4",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#a6adc8",
      brightBlack: "#585b70",
      brightRed: "#f37799",
      brightGreen: "#89d88b",
      brightYellow: "#ebd391",
      brightBlue: "#74a8fc",
      brightMagenta: "#f2aede",
      brightCyan: "#6bd7ca",
      brightWhite: "#bac2de",
    },
    ui: {
      name: "Catppuccin Mocha",
      isDark: true,
      base: "#1e1e2e",
      mantle: "#181825",
      crust: "#11111b",
      surface0: "#313244",
      surface1: "#45475a",
      surface2: "#585b70",
      overlay0: "#6c7086",
      overlay1: "#7f849c",
      overlay2: "#9399b2",
      text: "#cdd6f4",
      subtext0: "#a6adc8",
      subtext1: "#bac2de",
      blue: "#89b4fa",
      green: "#a6e3a1",
      red: "#f38ba8",
      yellow: "#f9e2af",
      magenta: "#cba6f7",
      cyan: "#94e2d5",
      lavender: "#b4befe",
      pink: "#f5c2e7",
    },
  },
  // Catppuccin Latte (light)
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    terminal: {
      name: "Catppuccin Latte",
      background: "#eff1f5",
      foreground: "#4c4f69",
      cursor: "#dc8a78",
      cursorAccent: "#eff1f5",
      selectionBackground: "#acb0be",
      selectionForeground: "#4c4f69",
      black: "#5c5f77",
      red: "#d20f39",
      green: "#40a02b",
      yellow: "#df8e1d",
      blue: "#1e66f5",
      magenta: "#ea76cb",
      cyan: "#179299",
      white: "#acb0be",
      brightBlack: "#6c6f85",
      brightRed: "#d20f39",
      brightGreen: "#40a02b",
      brightYellow: "#df8e1d",
      brightBlue: "#1e66f5",
      brightMagenta: "#ea76cb",
      brightCyan: "#179299",
      brightWhite: "#bcc0cc",
    },
    ui: {
      name: "Catppuccin Latte",
      isDark: false,
      base: "#eff1f5",
      mantle: "#e6e9ef",
      crust: "#dce0e8",
      surface0: "#ccd0da",
      surface1: "#bcc0cc",
      surface2: "#acb0be",
      overlay0: "#9ca0b0",
      overlay1: "#8c8fa1",
      overlay2: "#7c7f93",
      text: "#4c4f69",
      subtext0: "#6c6f85",
      subtext1: "#5c5f77",
      blue: "#1e66f5",
      green: "#40a02b",
      red: "#d20f39",
      yellow: "#df8e1d",
      magenta: "#8839ef",
      cyan: "#179299",
      lavender: "#7287fd",
      pink: "#ea76cb",
    },
  },
  // Dracula
  {
    id: "dracula",
    name: "Dracula",
    terminal: {
      name: "Dracula",
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#282a36",
      selectionBackground: "#44475a",
      selectionForeground: "#ffffff",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
    ui: {
      name: "Dracula",
      isDark: true,
      base: "#282a36",
      mantle: "#1e1f29",
      crust: "#191a21",
      surface0: "#44475a",
      surface1: "#4d5066",
      surface2: "#565973",
      overlay0: "#6272a4",
      overlay1: "#7082b4",
      overlay2: "#8292c4",
      text: "#f8f8f2",
      subtext0: "#e0e0dc",
      subtext1: "#c8c8c2",
      blue: "#bd93f9",
      green: "#50fa7b",
      red: "#ff5555",
      yellow: "#f1fa8c",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      lavender: "#bd93f9",
      pink: "#ff79c6",
    },
  },
  // Nord
  {
    id: "nord",
    name: "Nord",
    terminal: {
      name: "Nord",
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#eceff4",
      cursorAccent: "#282828",
      selectionBackground: "#eceff4",
      selectionForeground: "#4c566a",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#596377",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
    ui: {
      name: "Nord",
      isDark: true,
      base: "#2e3440",
      mantle: "#272c36",
      crust: "#21262e",
      surface0: "#3b4252",
      surface1: "#434c5e",
      surface2: "#4c566a",
      overlay0: "#616e88",
      overlay1: "#7b88a1",
      overlay2: "#9199aa",
      text: "#eceff4",
      subtext0: "#d8dee9",
      subtext1: "#e5e9f0",
      blue: "#81a1c1",
      green: "#a3be8c",
      red: "#bf616a",
      yellow: "#ebcb8b",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      lavender: "#88c0d0",
      pink: "#b48ead",
    },
  },
  // Gruvbox Dark
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    terminal: {
      name: "Gruvbox Dark",
      background: "#282828",
      foreground: "#ebdbb2",
      cursor: "#ebdbb2",
      cursorAccent: "#282828",
      selectionBackground: "#665c54",
      selectionForeground: "#ebdbb2",
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
    ui: {
      name: "Gruvbox Dark",
      isDark: true,
      base: "#282828",
      mantle: "#1d2021",
      crust: "#171819",
      surface0: "#3c3836",
      surface1: "#504945",
      surface2: "#665c54",
      overlay0: "#7c6f64",
      overlay1: "#928374",
      overlay2: "#a89984",
      text: "#ebdbb2",
      subtext0: "#d5c4a1",
      subtext1: "#bdae93",
      blue: "#83a598",
      green: "#b8bb26",
      red: "#fb4934",
      yellow: "#fabd2f",
      magenta: "#d3869b",
      cyan: "#8ec07c",
      lavender: "#83a598",
      pink: "#d3869b",
    },
  },
  // Gruvbox Light
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    terminal: {
      name: "Gruvbox Light",
      background: "#fbf1c7",
      foreground: "#3c3836",
      cursor: "#3c3836",
      cursorAccent: "#fbf1c7",
      selectionBackground: "#d5c4a1",
      selectionForeground: "#3c3836",
      black: "#fbf1c7",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#7c6f64",
      brightBlack: "#928374",
      brightRed: "#9d0006",
      brightGreen: "#79740e",
      brightYellow: "#b57614",
      brightBlue: "#076678",
      brightMagenta: "#8f3f71",
      brightCyan: "#427b58",
      brightWhite: "#3c3836",
    },
    ui: {
      name: "Gruvbox Light",
      isDark: false,
      base: "#fbf1c7",
      mantle: "#f2e5bc",
      crust: "#ebdbb2",
      surface0: "#d5c4a1",
      surface1: "#bdae93",
      surface2: "#a89984",
      overlay0: "#928374",
      overlay1: "#7c6f64",
      overlay2: "#665c54",
      text: "#3c3836",
      subtext0: "#504945",
      subtext1: "#665c54",
      blue: "#076678",
      green: "#79740e",
      red: "#9d0006",
      yellow: "#b57614",
      magenta: "#8f3f71",
      cyan: "#427b58",
      lavender: "#076678",
      pink: "#8f3f71",
    },
  },
  // Tokyo Night
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    terminal: {
      name: "Tokyo Night",
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      cursorAccent: "#15161e",
      selectionBackground: "#33467c",
      selectionForeground: "#c0caf5",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
    ui: {
      name: "Tokyo Night",
      isDark: true,
      base: "#1a1b26",
      mantle: "#16161e",
      crust: "#13131a",
      surface0: "#24283b",
      surface1: "#2f344d",
      surface2: "#414868",
      overlay0: "#565f89",
      overlay1: "#6b739d",
      overlay2: "#9099b2",
      text: "#c0caf5",
      subtext0: "#a9b1d6",
      subtext1: "#9aa5ce",
      blue: "#7aa2f7",
      green: "#9ece6a",
      red: "#f7768e",
      yellow: "#e0af68",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      lavender: "#7aa2f7",
      pink: "#bb9af7",
    },
  },
  // One Dark
  {
    id: "one-dark",
    name: "One Dark",
    terminal: {
      name: "One Dark",
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#528bff",
      cursorAccent: "#282c34",
      selectionBackground: "#3e4451",
      selectionForeground: "#abb2bf",
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#abb2bf",
      brightBlack: "#5c6370",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
    ui: {
      name: "One Dark",
      isDark: true,
      base: "#282c34",
      mantle: "#21252b",
      crust: "#1b1f23",
      surface0: "#3e4451",
      surface1: "#4b5263",
      surface2: "#5c6370",
      overlay0: "#636d83",
      overlay1: "#7f8799",
      overlay2: "#9199a9",
      text: "#abb2bf",
      subtext0: "#9da5b4",
      subtext1: "#8b9299",
      blue: "#61afef",
      green: "#98c379",
      red: "#e06c75",
      yellow: "#e5c07b",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      lavender: "#61afef",
      pink: "#c678dd",
    },
  },
  // Solarized Dark
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    terminal: {
      name: "Solarized Dark",
      background: "#002b36",
      foreground: "#839496",
      cursor: "#839496",
      cursorAccent: "#002b36",
      selectionBackground: "#073642",
      selectionForeground: "#93a1a1",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
    ui: {
      name: "Solarized Dark",
      isDark: true,
      base: "#002b36",
      mantle: "#00252f",
      crust: "#001f27",
      surface0: "#073642",
      surface1: "#0a4050",
      surface2: "#0d4a5e",
      overlay0: "#586e75",
      overlay1: "#657b83",
      overlay2: "#839496",
      text: "#93a1a1",
      subtext0: "#839496",
      subtext1: "#657b83",
      blue: "#268bd2",
      green: "#859900",
      red: "#dc322f",
      yellow: "#b58900",
      magenta: "#d33682",
      cyan: "#2aa198",
      lavender: "#6c71c4",
      pink: "#d33682",
    },
  },
  // Solarized Light
  {
    id: "solarized-light",
    name: "Solarized Light",
    terminal: {
      name: "Solarized Light",
      background: "#fdf6e3",
      foreground: "#657b83",
      cursor: "#657b83",
      cursorAccent: "#fdf6e3",
      selectionBackground: "#eee8d5",
      selectionForeground: "#586e75",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
    ui: {
      name: "Solarized Light",
      isDark: false,
      base: "#fdf6e3",
      mantle: "#f5eedb",
      crust: "#eee8d5",
      surface0: "#e6e0cd",
      surface1: "#d9d3c3",
      surface2: "#ccc7b8",
      overlay0: "#93a1a1",
      overlay1: "#839496",
      overlay2: "#657b83",
      text: "#586e75",
      subtext0: "#657b83",
      subtext1: "#839496",
      blue: "#268bd2",
      green: "#859900",
      red: "#dc322f",
      yellow: "#b58900",
      magenta: "#d33682",
      cyan: "#2aa198",
      lavender: "#6c71c4",
      pink: "#d33682",
    },
  },
];

// =============================================================================
// Theme Management
// =============================================================================

// Current applied theme
let currentTheme: Theme = BUNDLED_THEMES[0]; // Default to Catppuccin Mocha

/**
 * Get theme by ID
 */
export function getThemeById(id: string): Theme | undefined {
  return BUNDLED_THEMES.find(t => t.id === id);
}

/**
 * Get all available themes
 */
export function getAllThemes(): Theme[] {
  return BUNDLED_THEMES;
}

/**
 * Get current theme
 */
export function getCurrentTheme(): Theme {
  return currentTheme;
}

/**
 * Apply theme to terminal
 */
export function applyTerminalTheme(terminal: any, theme: Theme): void {
  if (!terminal || !terminal.options) return;

  const t = theme.terminal;
  const newTheme = {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.cursorAccent,
    selectionBackground: t.selectionBackground,
    selectionForeground: t.selectionForeground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };

  console.log('[themes] Applying terminal theme:', theme.name);

  // This triggers Proxy set which calls handleOptionChange in terminal.ts
  terminal.options.theme = newTheme;
}

/**
 * Apply UI theme by updating CSS custom properties
 */
export function applyUITheme(theme: Theme): void {
  const root = document.documentElement;
  const ui = theme.ui;

  // Base colors
  root.style.setProperty("--color-base", ui.base);
  root.style.setProperty("--color-mantle", ui.mantle);
  root.style.setProperty("--color-crust", ui.crust);

  // Surface colors
  root.style.setProperty("--color-surface-0", ui.surface0);
  root.style.setProperty("--color-surface-1", ui.surface1);
  root.style.setProperty("--color-surface-2", ui.surface2);

  // Overlay colors
  root.style.setProperty("--color-overlay-0", ui.overlay0);
  root.style.setProperty("--color-overlay-1", ui.overlay1);
  root.style.setProperty("--color-overlay-2", ui.overlay2);

  // Text colors
  root.style.setProperty("--color-text", ui.text);
  root.style.setProperty("--color-subtext-0", ui.subtext0);
  root.style.setProperty("--color-subtext-1", ui.subtext1);

  // Accent colors
  root.style.setProperty("--color-blue", ui.blue);
  root.style.setProperty("--color-green", ui.green);
  root.style.setProperty("--color-red", ui.red);
  root.style.setProperty("--color-yellow", ui.yellow);
  root.style.setProperty("--color-mauve", ui.magenta);
  root.style.setProperty("--color-teal", ui.cyan);
  root.style.setProperty("--color-lavender", ui.lavender);
  root.style.setProperty("--color-pink", ui.pink);

  // Also set some derived colors
  root.style.setProperty("--color-sapphire", ui.cyan);
  root.style.setProperty("--color-sky", ui.cyan);
  root.style.setProperty("--color-peach", ui.yellow);
  root.style.setProperty("--color-maroon", ui.red);
  root.style.setProperty("--color-flamingo", ui.pink);
  root.style.setProperty("--color-rosewater", ui.pink);

  // Update background color on body
  document.body.style.backgroundColor = ui.base;
}

/**
 * Apply full theme (terminal + UI)
 */
export function applyTheme(theme: Theme, terminal?: any): void {
  currentTheme = theme;

  // Apply UI theme
  applyUITheme(theme);

  // Apply terminal theme if terminal is provided
  if (terminal) {
    applyTerminalTheme(terminal, theme);
  }

  console.log(`[themes] Applied theme: ${theme.name}`);
}

/**
 * Set theme by ID
 */
export function setThemeById(id: string, terminal?: any): boolean {
  const theme = getThemeById(id);
  if (!theme) {
    console.warn(`[themes] Theme not found: ${id}`);
    return false;
  }

  applyTheme(theme, terminal);
  return true;
}

// =============================================================================
// Font System
// =============================================================================

export type TerminalFontFamily = "fira-code" | "hack" | "system-mono";

export interface TerminalFontConfig {
  family: TerminalFontFamily;
  size: number;
}

/**
 * Get CSS font-family string for terminal font
 */
export function getTerminalFontFamily(family: TerminalFontFamily): string {
  switch (family) {
    case "fira-code":
      return "'FiraCode Nerd Font Mono', 'Fira Code', monospace";
    case "hack":
      return "'Hack Nerd Font Mono', 'Hack', monospace";
    case "system-mono":
      return "ui-monospace, 'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Segoe UI Mono', 'Roboto Mono', 'Ubuntu Mono', Consolas, monospace";
    default:
      return "'FiraCode Nerd Font Mono', monospace";
  }
}

/**
 * Get display name for font family
 */
export function getFontFamilyDisplayName(family: TerminalFontFamily): string {
  switch (family) {
    case "fira-code":
      return "Fira Code";
    case "hack":
      return "Hack";
    case "system-mono":
      return "System Mono";
    default:
      return "Unknown";
  }
}

/**
 * Apply terminal font
 */
export function applyTerminalFont(terminal: any, config: TerminalFontConfig): void {
  if (!terminal || !terminal.options) return;

  terminal.options.fontFamily = getTerminalFontFamily(config.family);
  terminal.options.fontSize = config.size;

  // Force refresh
  terminal.refresh(0, terminal.rows - 1);
}

// =============================================================================
// UI Font Size
// =============================================================================

/**
 * Apply UI font size
 */
export function applyUIFontSize(size: number): void {
  const root = document.documentElement;
  root.style.setProperty("--ui-font-size", `${size}px`);
  document.body.style.fontSize = `${size}px`;
}

// =============================================================================
// Event System for Theme Changes
// =============================================================================

type ThemeChangeCallback = (theme: Theme) => void;
const themeChangeCallbacks: ThemeChangeCallback[] = [];

/**
 * Subscribe to theme changes
 */
export function onThemeChange(callback: ThemeChangeCallback): () => void {
  themeChangeCallbacks.push(callback);
  return () => {
    const index = themeChangeCallbacks.indexOf(callback);
    if (index > -1) {
      themeChangeCallbacks.splice(index, 1);
    }
  };
}

/**
 * Notify theme change listeners
 */
export function notifyThemeChange(theme: Theme): void {
  themeChangeCallbacks.forEach(cb => cb(theme));
}
