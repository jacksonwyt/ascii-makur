export const STYLE_LABELS = {
  classic: "Classic ASCII",
  braille: "Braille",
  halftone: "Halftone",
  dotcross: "Dot Cross",
  line: "Line",
  particles: "Particles",
  claude: "Claude Code",
  retro: "Retro Art",
  terminal: "Terminal"
};

export const CHARSET_LABELS = {
  standard: "Standard (@%#*+=-:. )",
  blocks: "Blocks (█▓▒░ )",
  detailed: "Detailed ($@B%8&WM... )",
  minimal: "Minimal (·░█)",
  binary: "Binary (01)",
  custom: "Custom",
  "letters-alphabet": "Letters (A-Z)",
  "letters-lowercase": "Letters (a-z)",
  "letters-mixed": "Letters (Aa)",
  "letters-symbols": "Letters (Symbols)"
};

export const BRAILLE_VARIANT_LABELS = {
  standard: "Standard",
  sparse: "Sparse",
  dense: "Dense"
};

export const HALFTONE_SHAPE_LABELS = {
  circle: "Circle",
  square: "Square",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon"
};

export const RETRO_DUOTONE_LABELS = {
  "amber-classic": "Amber Classic",
  "cyan-night": "Cyan Night",
  "violet-haze": "Violet Haze",
  "lime-pulse": "Lime Pulse",
  "mono-ice": "Mono Ice"
};

export const TERMINAL_CHARSET_LABELS = {
  binary: "101010",
  brackets: "[]/\\<>",
  symbols: "$_+",
  mixed: "Mixed Terminal",
  matrix: "{}[]|/\\_+-"
};

export const DITHER_LABELS = {
  none: "None",
  "floyd-steinberg": "Floyd-Steinberg",
  bayer: "Bayer (Ordered)",
  atkinson: "Atkinson"
};

export const COLOR_MODE_LABELS = {
  grayscale: "Grayscale",
  color: "Full Color",
  green: "Matrix Green",
  amber: "Amber Monitor",
  custom: "Custom"
};

export const OVERLAY_LABELS = {
  none: "None",
  noise: "Noise Field",
  intervals: "Intervals",
  beam: "Beam Sweep",
  glitch: "Glitch",
  crt: "CRT Monitor",
  matrix: "Matrix Rain"
};

export const INTERACTION_LABELS = {
  none: "None",
  attract: "Attract",
  push: "Push"
};

export const OUTPUT_ASPECT_LABELS = {
  source: "Original",
  "16:9": "16:9",
  "4:3": "4:3",
  "1:1": "1:1",
  "3:4": "3:4",
  "9:16": "9:16"
};

export const FONT_OPTIONS = {
  '"Space Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif': "Space Grotesk",
  '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif': "Inter",
  '"Poppins", "Helvetica Neue", Helvetica, Arial, sans-serif': "Poppins",
  '"Helvetica Neue", Helvetica, Arial, sans-serif': "Helvetica Neue",
  '"VT323", "Courier New", monospace': "VT323 (Pixel)"
};

export const IMAGE_FORMATS = [
  { value: "png", label: "PNG", mime: "image/png", extension: "png", supportsQuality: false },
  { value: "jpg", label: "JPG", mime: "image/jpeg", extension: "jpg", supportsQuality: true },
  { value: "webp", label: "WEBP", mime: "image/webp", extension: "webp", supportsQuality: true }
];

export const IMAGE_RESOLUTIONS = [720, 1080, 1440, 2160];
export const GIF_RESOLUTIONS = [320, 480, 720, 1080];
export const VIDEO_RESOLUTIONS = [320, 480, 720, 1080, 1440, 2160];
export const VIDEO_QUALITY_LABELS = { low: "Low", medium: "Medium", high: "High" };
export const SVG_MODE_LABELS = { text: "Text Glyphs", dots: "Circle Dots" };
export const SVG_DENSITY_OPTIONS = [0.5, 1, 1.5, 2];

export const DIRECTION_OPTIONS = [
  { key: "up", label: "Up", icon: "↑" },
  { key: "down", label: "Down", icon: "↓" },
  { key: "left", label: "Left", icon: "←" },
  { key: "right", label: "Right", icon: "→" },
  { key: "top-left", label: "Top Left", icon: "↖" },
  { key: "top-right", label: "Top Right", icon: "↗" },
  { key: "bottom-left", label: "Bottom Left", icon: "↙" },
  { key: "bottom-right", label: "Bottom Right", icon: "↘" }
];

export const SOURCE_HINT = "Supports: JPG, PNG, GIF, MP4, WebM";

export const GLYPH_MAPS = {
  standard: " .:-=+*#%@",
  blocks: " ░▒▓█",
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  minimal: " ·░█",
  binary: " 01",
  "letters-alphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "letters-lowercase": "abcdefghijklmnopqrstuvwxyz",
  "letters-mixed": "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz",
  "letters-symbols": "@#$%&*+=-<>~",
  braille:
    " ⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿",
  claude: " ░▒▓█",
  retro: " ░▒▓█",
  terminal: " 01"
};

export const BRAILLE_VARIANTS = {
  standard: GLYPH_MAPS.braille,
  sparse: " ⠁⠂⠄⠈⠐⠠⡀⢀⣀⣿",
  dense: " ⠃⠇⠏⠟⠿"
};

export const TERMINAL_MAPS = {
  binary: " 010101",
  brackets: " []/\\<>",
  symbols: " $_+",
  mixed: " 01[]/\\<>$_+|",
  matrix: " 01{}[]/\\<>|_+-"
};

export const RETRO_PALETTES = {
  "amber-classic": { low: { r: 20, g: 12, b: 6 }, high: { r: 255, g: 223, b: 178 } },
  "cyan-night": { low: { r: 6, g: 16, b: 22 }, high: { r: 166, g: 240, b: 255 } },
  "violet-haze": { low: { r: 17, g: 10, b: 26 }, high: { r: 242, g: 198, b: 255 } },
  "lime-pulse": { low: { r: 10, g: 18, b: 8 }, high: { r: 226, g: 255, b: 162 } },
  "mono-ice": { low: { r: 12, g: 12, b: 12 }, high: { r: 245, g: 248, b: 255 } }
};

export const DEFAULT_SETTINGS = {
  charset: "standard",
  customCharset: " .:-=+*#%@",
  brailleVariant: "standard",
  fontSize: 10,
  hoverStrength: 24,
  mouseInteractionMode: "attract",
  mouseAreaSize: 180,
  mouseSpread: 1,
  charSpacing: 1,
  renderFont: '"Space Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif',
  outputAspect: "source",
  contrast: 1,
  brightness: 0,
  opacity: 1,
  vignette: 0,
  borderGlow: 0,
  bgDither: 0,
  inverseDither: 0,
  invert: false,
  ditherType: "floyd-steinberg",
  ditherStrength: 0.8,
  style: "classic",
  halftoneShape: "circle",
  halftoneSize: 1,
  halftoneRotation: 0,
  colorMode: "grayscale",
  terminalCharset: "binary",
  retroDuotone: "amber-classic",
  retroNoise: 0.45,
  backgroundColor: "#000000",
  customColor: "#00ff99",
  particleDensity: 0.5,
  particleChar: "*",
  letterSet: "alphabet",
  lineLength: 1,
  lineWidth: 1,
  lineThickness: 1.6,
  lineRotation: 0,
  overlayPreset: "noise",
  overlayStrength: 0.45,
  noiseScale: 24,
  noiseSpeed: 1,
  noiseDirection: "right",
  intervalSpacing: 12,
  intervalSpeed: 1,
  intervalWidth: 2,
  intervalDirection: "down",
  beamDirection: "right",
  glitchDirection: "right",
  crtDirection: "down",
  matrixDirection: "down",
  matrixScale: 18,
  matrixSpeed: 1
};

export const DEFAULT_EXPORT_SETTINGS = {
  imageName: "ascii-makur-export",
  imageFormat: "png",
  imageResolution: 1080,
  imageQuality: 92,
  svgName: "ascii-makur-export",
  svgMode: "text",
  svgDensity: 1,
  svgIncludeBackground: true,
  svgUseRenderedColors: true,
  svgMonoColor: "#ffffff",
  animationName: "ascii-makur-export",
  animationDuration: 6,
  animationFps: 24,
  gifResolution: 720,
  videoResolution: 1080,
  videoQuality: "medium"
};
