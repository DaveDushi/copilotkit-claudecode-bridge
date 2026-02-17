/**
 * Design tokens for the File Analysis Studio.
 * All components import from here for consistent styling.
 */

export const colors = {
  // Backgrounds
  bg: "#f7f8fa",
  surface: "#ffffff",
  surfaceHover: "#f0f2f5",
  surfaceActive: "#e8ebf0",
  border: "#e2e5ea",
  borderLight: "#eef0f3",

  // Text
  text: "#1a1d23",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",

  // Accent (indigo)
  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentLight: "#eef2ff",
  accentText: "#4338ca",

  // Semantic
  success: "#10b981",
  successLight: "#ecfdf5",
  warning: "#f59e0b",
  warningLight: "#fffbeb",
  error: "#ef4444",
  errorLight: "#fef2f2",
  info: "#3b82f6",
  infoLight: "#eff6ff",

  // Tool card colors
  toolBash: "#1e293b",
  toolBashFg: "#e2e8f0",
  toolEdit: "#ecfdf5",
  toolWrite: "#eff6ff",
  toolRead: "#f8fafc",
  toolGlob: "#fff7ed",
  toolGrep: "#fef2f2",
  toolCanvas: "#f5f3ff",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export const shadows = {
  sm: "0 1px 2px rgba(0,0,0,0.04)",
  md: "0 2px 8px rgba(0,0,0,0.06)",
  lg: "0 4px 16px rgba(0,0,0,0.08)",
  xl: "0 8px 24px rgba(0,0,0,0.10)",
  inner: "inset 0 1px 2px rgba(0,0,0,0.04)",
} as const;

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
  sizes: { xs: 11, sm: 12, md: 13, lg: 14, xl: 16, xxl: 20, title: 24 },
  weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

export const transitions = {
  fast: "all 0.12s ease",
  normal: "all 0.2s ease",
  slow: "all 0.3s ease",
} as const;
