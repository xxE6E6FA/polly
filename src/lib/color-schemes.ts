export const COLOR_SCHEMES = [
  "polly",
  "catppuccin",
  "dracula",
  "nord",
  "classic",
] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const DEFAULT_COLOR_SCHEME: ColorScheme = "polly";

export type ColorSchemeDefinition = {
  id: ColorScheme;
  name: string;
  description: string;
  preview: {
    light: { bg: string; primary: string; accent: string };
    dark: { bg: string; primary: string; accent: string };
  };
};

export const COLOR_SCHEME_DEFINITIONS: ColorSchemeDefinition[] = [
  {
    id: "polly",
    name: "Polly",
    description: "Warm lavender with purple accents",
    preview: {
      light: { bg: "#f6f2fb", primary: "#5511d4", accent: "#7c3aed" },
      dark: { bg: "#110d1a", primary: "#b07afc", accent: "#7c3aed" },
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    description: "Soothing pastels for productivity",
    preview: {
      light: { bg: "#eff1f5", primary: "#8839ef", accent: "#ea76cb" },
      dark: { bg: "#1e1e2e", primary: "#cba6f7", accent: "#f5c2e7" },
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Dark elegance with vibrant pops",
    preview: {
      light: { bg: "#fffbeb", primary: "#a3144d", accent: "#644ac9" },
      dark: { bg: "#282a36", primary: "#ff79c6", accent: "#bd93f9" },
    },
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic-inspired muted tones",
    preview: {
      light: { bg: "#eceff4", primary: "#88c0d0", accent: "#81a1c1" },
      dark: { bg: "#2e3440", primary: "#88c0d0", accent: "#81a1c1" },
    },
  },
  {
    id: "classic",
    name: "Classic",
    description: "Clean grayscale, no distractions",
    preview: {
      light: { bg: "#fcfcfc", primary: "#1a1a1a", accent: "#525252" },
      dark: { bg: "#141414", primary: "#f2f2f2", accent: "#a3a3a3" },
    },
  },
];
