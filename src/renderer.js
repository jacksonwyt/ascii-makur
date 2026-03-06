import {
  BRAILLE_VARIANTS,
  DEFAULT_SETTINGS,
  GLYPH_MAPS,
  RETRO_PALETTES,
  TERMINAL_MAPS
} from "./config.js";

const MATRIX_GLYPHS = " 01{}[]/\\<>|_+-";
const DOTCROSS_GLYPHS = " .+x#@";
const CLAUDE_GLYPHS = " ░▒▓█";
const RETRO_GLYPHS = " ░▒▓█";
const CLICK_BURST_DURATION_MS = 720;
const CLICK_BURST_RADIUS = 88;
const DITHER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(value) {
  const normalized = String(value || "").trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return { r: 255, g: 255, b: 255 };
  }
  const hex = match[1].length === 3 ? match[1].split("").map((part) => part + part).join("") : match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function invertCssColor(value) {
  const { r, g, b } = hexToRgb(value);
  return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
}

function toCssColor(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function mixColor(low, high, t) {
  return {
    r: clamp(Math.round(lerp(low.r, high.r, t)), 0, 255),
    g: clamp(Math.round(lerp(low.g, high.g, t)), 0, 255),
    b: clamp(Math.round(lerp(low.b, high.b, t)), 0, 255)
  };
}

function relativeAspect(aspectLabel, sourceWidth, sourceHeight) {
  if (!aspectLabel || aspectLabel === "source") {
    return sourceWidth / Math.max(1, sourceHeight);
  }
  const [w, h] = String(aspectLabel)
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return sourceWidth / Math.max(1, sourceHeight);
  }
  return w / h;
}

function cropRect(sourceWidth, sourceHeight, targetAspect) {
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect;
    cropX = (sourceWidth - cropWidth) * 0.5;
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect;
    cropY = (sourceHeight - cropHeight) * 0.5;
  }

  return { cropX, cropY, cropWidth, cropHeight };
}

function directionVector(direction) {
  switch (direction) {
    case "up":
      return { dx: 0, dy: -1 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    case "right":
      return { dx: 1, dy: 0 };
    case "top-left":
      return { dx: -Math.SQRT1_2, dy: -Math.SQRT1_2 };
    case "top-right":
      return { dx: Math.SQRT1_2, dy: -Math.SQRT1_2 };
    case "bottom-left":
      return { dx: -Math.SQRT1_2, dy: Math.SQRT1_2 };
    case "bottom-right":
      return { dx: Math.SQRT1_2, dy: Math.SQRT1_2 };
    default:
      return { dx: 1, dy: 0 };
  }
}

function directionBasis(direction) {
  const { dx, dy } = directionVector(direction);
  const perpX = -dy;
  const perpY = dx;
  const primaryMin = (dx < 0 ? dx : 0) + (dy < 0 ? dy : 0);
  const primarySpan = Math.max(0.0001, (dx > 0 ? dx : 0) + (dy > 0 ? dy : 0) - primaryMin);
  const secondaryMin = (perpX < 0 ? perpX : 0) + (perpY < 0 ? perpY : 0);
  const secondarySpan = Math.max(
    0.0001,
    (perpX > 0 ? perpX : 0) + (perpY > 0 ? perpY : 0) - secondaryMin
  );
  return { dx, dy, perpX, perpY, primaryMin, primarySpan, secondaryMin, secondarySpan };
}

function directionalCoordinates(column, row, columns, rows, basis) {
  const x = column / Math.max(columns - 1, 1);
  const y = row / Math.max(rows - 1, 1);
  const primary = x * basis.dx + y * basis.dy;
  const secondary = x * basis.perpX + y * basis.perpY;
  return {
    primary: clamp((primary - basis.primaryMin) / basis.primarySpan, 0, 1),
    secondary: clamp((secondary - basis.secondaryMin) / basis.secondarySpan, 0, 1)
  };
}

function bayerNoise(column, row) {
  return DITHER_MATRIX[row % 4][column % 4] / 16;
}

function proceduralColor(column, row, width, height, time) {
  const x = column / Math.max(1, width);
  const y = row / Math.max(1, height);
  const wave =
    Math.sin(x * 11 + time * 0.8) * 0.4 +
    Math.cos(y * 9 - time * 0.9) * 0.35 +
    Math.sin((x + y) * 13 + time * 0.6) * 0.25;
  const energy = clamp((wave + 1) * 0.5, 0, 1);
  return {
    r: Math.round(lerp(14, 28, energy)),
    g: Math.round(lerp(18, 210, energy)),
    b: Math.round(lerp(30, 255, energy))
  };
}

function loopState(settings, source, timeSeconds) {
  const enabled =
    settings.__loopSeamless === true &&
    (source?.type === "image" || source?.type === "procedural");
  if (!enabled) {
    return {
      enabled: false,
      progress: 0,
      theta: 0,
      oscillation(rate, scale = 1) {
        return timeSeconds * rate * scale;
      },
      cycle(rate) {
        return ((timeSeconds * rate) % 1 + 1) % 1;
      }
    };
  }

  const duration = clamp(Number(settings.__loopDuration) || 6, 1, 30);
  const progress = (((timeSeconds % duration) + duration) % duration) / duration;
  return {
    enabled: true,
    progress,
    theta: progress * Math.PI * 2,
    oscillation(cycles, scale = 1) {
      return progress * Math.PI * 2 * Math.max(1, Math.round(cycles)) * scale;
    },
    cycle(cycles) {
      return ((progress * Math.max(1, Math.round(cycles))) % 1 + 1) % 1;
    }
  };
}

function processLuma(luma, settings) {
  let output = luma;
  output = (output - 128) * settings.contrast + 128;
  output += settings.brightness * 2;
  output = clamp(output, 0, 255);
  if (settings.invert) {
    output = 255 - output;
  }
  return output;
}

function getGlyphSet(settings) {
  if (settings.style === "braille") {
    return BRAILLE_VARIANTS[settings.brailleVariant] || BRAILLE_VARIANTS.standard;
  }
  if (settings.style === "halftone") {
    return "o";
  }
  if (settings.style === "dotcross") {
    return DOTCROSS_GLYPHS;
  }
  if (settings.style === "particles") {
    return ` ${settings.particleChar || "*"}`;
  }
  if (settings.style === "claude") {
    return CLAUDE_GLYPHS;
  }
  if (settings.style === "retro") {
    return RETRO_GLYPHS;
  }
  if (settings.style === "terminal") {
    return TERMINAL_MAPS[settings.terminalCharset] || TERMINAL_MAPS.binary;
  }
  if (settings.charset === "custom") {
    return (settings.customCharset || DEFAULT_SETTINGS.customCharset).slice(0, 100) || DEFAULT_SETTINGS.customCharset;
  }
  return GLYPH_MAPS[settings.charset] || GLYPH_MAPS.standard;
}

function edgeStrength(lumaField, column, row, columns, rows) {
  const index = row * columns + column;
  const center = lumaField[index] ?? 0;
  const left = column > 0 ? lumaField[index - 1] ?? center : center;
  const right = column + 1 < columns ? lumaField[index + 1] ?? center : center;
  const top = row > 0 ? lumaField[index - columns] ?? center : center;
  const bottom = row + 1 < rows ? lumaField[index + columns] ?? center : center;
  return clamp((Math.abs(right - left) + Math.abs(bottom - top)) / 510, 0, 1);
}

function pickGlyph(intensity, glyphs) {
  if (!glyphs || glyphs.length === 0) {
    return " ";
  }
  const normalized = clamp(intensity / 255, 0, 1);
  const index = Math.round(normalized * (glyphs.length - 1));
  return glyphs[index] || glyphs[glyphs.length - 1];
}

function applyDither(values, columns, rows, settings) {
  const dithered = new Float32Array(values);

  if (settings.ditherType === "bayer") {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const delta = (bayerNoise(column, row) - 0.5) * 255 * settings.ditherStrength;
        dithered[index] = clamp(dithered[index] + delta, 0, 255);
      }
    }
    return dithered;
  }

  if (settings.ditherType !== "floyd-steinberg" && settings.ditherType !== "atkinson") {
    return dithered;
  }

  const quantizeStep = 255 / Math.max(2, getGlyphSet(settings).length - 1);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const current = dithered[index];
      const quantized = Math.round(current / quantizeStep) * quantizeStep;
      const error = (current - quantized) * settings.ditherStrength;
      dithered[index] = clamp(quantized, 0, 255);

      if (settings.ditherType === "floyd-steinberg") {
        if (column + 1 < columns) dithered[index + 1] += (error * 7) / 16;
        if (column - 1 >= 0 && row + 1 < rows) dithered[index + columns - 1] += (error * 3) / 16;
        if (row + 1 < rows) dithered[index + columns] += (error * 5) / 16;
        if (column + 1 < columns && row + 1 < rows) dithered[index + columns + 1] += error / 16;
      } else {
        if (column + 1 < columns) dithered[index + 1] += error / 8;
        if (column + 2 < columns) dithered[index + 2] += error / 8;
        if (column - 1 >= 0 && row + 1 < rows) dithered[index + columns - 1] += error / 8;
        if (row + 1 < rows) dithered[index + columns] += error / 8;
        if (column + 1 < columns && row + 1 < rows) dithered[index + columns + 1] += error / 8;
        if (row + 2 < rows) dithered[index + columns * 2] += error / 8;
      }
    }
  }

  for (let index = 0; index < dithered.length; index += 1) {
    dithered[index] = clamp(dithered[index], 0, 255);
  }
  return dithered;
}

function overlayIntensity(baseValue, column, row, columns, rows, settings, timeSeconds, animationLoop) {
  const preset = settings.overlayPreset || "none";
  const strength = clamp(settings.overlayStrength ?? 0.45, 0, 1);
  if (preset === "none" || strength <= 0) {
    return baseValue;
  }

  if (preset === "noise") {
    const scale = clamp(settings.noiseScale ?? 24, 4, 120);
    const speed = clamp(settings.noiseSpeed ?? 1, 0, 4);
    const basis = directionBasis(settings.noiseDirection || "right");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const magnitude = Math.max(columns, rows);
    const phase = animationLoop.enabled
      ? animationLoop.oscillation(speed * 2.4)
      : timeSeconds * speed * 2.4;
    const primary = (coords.primary * magnitude + 17.3) / scale;
    const secondary = (coords.secondary * magnitude - 9.7) / scale;
    const wave = Math.sin(primary + phase) * Math.cos(secondary - phase * 0.73);
    const beatPhase = animationLoop.enabled
      ? animationLoop.oscillation(speed * 6.2)
      : phase * 6.2;
    const beat = Math.sin(coords.primary * magnitude * 1.37 + coords.secondary * magnitude * 2.11 + beatPhase);
    return clamp(baseValue + (wave * 0.65 + beat * 0.35) * (16 + strength * 72), 0, 255);
  }

  if (preset === "intervals") {
    const spacing = clamp(settings.intervalSpacing ?? 12, 4, 64);
    const speed = clamp(settings.intervalSpeed ?? 1, 0, 4);
    const width = clamp(settings.intervalWidth ?? 2, 1, 8);
    const basis = directionBasis(settings.intervalDirection || "down");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const primary = coords.primary * Math.max(columns, rows);
    const secondary = coords.secondary * Math.max(columns, rows);
    const shift = animationLoop.enabled
      ? animationLoop.cycle(speed * 1.7) * spacing
      : ((timeSeconds * speed * spacing * 1.7) % spacing + spacing) % spacing;
    const position = (primary + shift) % spacing;
    const distance = Math.min(position, spacing - position);
    const edge = 1 - clamp(distance / width, 0, 1);
    const pulse = Math.sin(
      (primary / spacing) * Math.PI * 2 +
        (animationLoop.enabled ? animationLoop.oscillation(speed * 1.8) : timeSeconds * speed * 1.8) +
        secondary * 0.011
    );
    return clamp(baseValue + edge * (strength * 88) * 0.85 + pulse * (strength * 88) * 0.32, 0, 255);
  }

  if (preset === "beam") {
    const basis = directionBasis(settings.beamDirection || "right");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const travel = animationLoop.enabled
      ? animationLoop.cycle(0.45 + strength * 2.2)
      : ((timeSeconds * (0.45 + strength * 2.2)) % 1.2 + 1.2) % 1.2 - 0.1;
    const width = 0.08 + strength * 0.22;
    const distance = Math.abs(coords.primary - travel);
    const beam = Math.max(0, 1 - distance / width);
    return clamp(baseValue + beam * (34 + strength * 120), 0, 255);
  }

  if (preset === "glitch") {
    const basis = directionBasis(settings.glitchDirection || "right");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const lineBucket = Math.floor((coords.secondary * Math.max(columns, rows)) / (2 + Math.floor((1 - strength) * 3)));
    const glitchClock = animationLoop.enabled ? animationLoop.oscillation(12, 7.11) : Math.floor(timeSeconds * 12) * 7.11;
    const phase = (Math.sin((lineBucket + 1) * 19.73 + glitchClock) + 1) * 0.5;
    const active = phase > 0.74 ? 1 : 0;
    const sweep = animationLoop.enabled
      ? (animationLoop.cycle(0.12 + strength * 0.28) + (Math.sin((lineBucket + 1) * 2.91) + 1) * 0.25) % 1
      : ((timeSeconds * (0.12 + strength * 0.28) + (Math.sin((lineBucket + 1) * 2.91) + 1) * 0.25) % 1 + 1) % 1;
    const distance = (coords.primary - sweep + 1) % 1;
    const bar = Math.max(0, 1 - distance / (0.12 + strength * 0.28));
    const ripple = Math.max(
      0,
      Math.sin(
        distance * Math.PI * (5 + strength * 8) -
          (animationLoop.enabled ? animationLoop.oscillation(2 + strength * 5) : timeSeconds * (2 + strength * 5))
      )
    );
    const staticNoise =
      Math.sin(
        (column + 1) * 17.7 +
          (row + 1) * 29.3 +
          (animationLoop.enabled ? animationLoop.oscillation(9.1) : timeSeconds * 9.1)
      ) *
      (1.5 + strength * 4.5);
    return clamp(baseValue + active * (bar * (18 + strength * 86) + ripple * (6 + strength * 26)) + staticNoise, 0, 255);
  }

  if (preset === "crt") {
    const basis = directionBasis(settings.crtDirection || "down");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const magnitude = Math.max(columns, rows);
    const x = column / Math.max(columns - 1, 1) * 2 - 1;
    const y = row / Math.max(rows - 1, 1) * 2 - 1;
    const vignetteLoss = (1 - clamp(x * x * 0.84 + y * y * 1.12, 0, 1)) * (24 + strength * 116);
    const scan = Math.sin(
      (coords.primary * magnitude + (animationLoop.enabled ? animationLoop.oscillation(6 + strength * 4, 1 / Math.PI) : timeSeconds * (34 + strength * 24))) *
        Math.PI
    );
    const flicker =
      Math.sin(animationLoop.enabled ? animationLoop.oscillation(10) : timeSeconds * 61) * 0.55 +
      Math.sin(animationLoop.enabled ? animationLoop.oscillation(4) : timeSeconds * 23) * 0.45;
    const highlight = Math.max(
      0,
      1 -
        Math.abs(
          coords.primary -
            (animationLoop.enabled
              ? animationLoop.cycle(0.12 + strength * 0.24)
              : (((timeSeconds * (0.12 + strength * 0.24)) % 1 + 1) % 1))
        ) /
          (0.045 + strength * 0.08)
    );
    return clamp(baseValue + scan * (14 + strength * 36) + flicker * (5 + strength * 14) + highlight * (18 + strength * 64) - vignetteLoss, 0, 255);
  }

  if (preset === "matrix") {
    const basis = directionBasis(settings.matrixDirection || "down");
    const coords = directionalCoordinates(column, row, columns, rows, basis);
    const scale = clamp(settings.matrixScale ?? 18, 6, 48);
    const speed = clamp(settings.matrixSpeed ?? 1, 0.1, 4);
    const drift = Math.sin(
      coords.secondary * scale * 0.7 + (animationLoop.enabled ? animationLoop.oscillation(speed * 4.2) : timeSeconds * speed * 4.2)
    );
    const rain = Math.cos(
      coords.primary * scale * 3.4 - (animationLoop.enabled ? animationLoop.oscillation(speed * 5.1) : timeSeconds * speed * 5.1)
    );
    return clamp(baseValue + (drift * 0.35 + rain * 0.65) * (38 + strength * 140), 0, 255);
  }

  return baseValue;
}

function styleColor(pixel, value, settings) {
  if (settings.style === "claude") {
    const warmed = clamp(value + 30, 0, 255);
    return {
      r: clamp(Math.floor(warmed * 1.02), 0, 255),
      g: clamp(Math.floor(warmed * 0.52), 0, 255),
      b: clamp(Math.floor(warmed * 0.1), 0, 255)
    };
  }

  if (settings.style === "terminal") {
    const terminal = clamp(value + 28, 0, 255);
    return {
      r: clamp(Math.floor(terminal * 0.14), 0, 96),
      g: terminal,
      b: clamp(Math.floor(terminal * 0.24), 0, 116)
    };
  }

  if (settings.style === "retro") {
    const palette = RETRO_PALETTES[settings.retroDuotone] || RETRO_PALETTES["amber-classic"];
    const normalized = clamp(Math.pow(clamp((value + 12) / 255, 0, 1), 0.94), 0, 1);
    return mixColor(palette.low, palette.high, normalized);
  }

  if (settings.colorMode === "color") {
    return {
      r: clamp(Math.floor(pixel.r), 0, 255),
      g: clamp(Math.floor(pixel.g), 0, 255),
      b: clamp(Math.floor(pixel.b), 0, 255)
    };
  }

  if (settings.colorMode === "green") {
    const green = clamp(value + 20, 0, 255);
    return {
      r: clamp(Math.floor(green * 0.2), 0, 255),
      g: green,
      b: clamp(Math.floor(green * 0.3), 0, 255)
    };
  }

  if (settings.colorMode === "amber") {
    const amber = clamp(value + 18, 0, 255);
    return {
      r: amber,
      g: clamp(Math.floor(amber * 0.72), 0, 255),
      b: clamp(Math.floor(amber * 0.16), 0, 255)
    };
  }

  if (settings.colorMode === "custom") {
    const custom = hexToRgb(settings.customColor);
    const normalized = value / 255;
    return {
      r: clamp(Math.floor(custom.r * normalized), 0, 255),
      g: clamp(Math.floor(custom.g * normalized), 0, 255),
      b: clamp(Math.floor(custom.b * normalized), 0, 255)
    };
  }

  return { r: value, g: value, b: value };
}

function glowColor(settings) {
  if (settings.style === "terminal") {
    return { r: 96, g: 255, b: 164 };
  }
  if (settings.style === "claude") {
    return { r: 255, g: 186, b: 118 };
  }
  if (settings.style === "retro") {
    return RETRO_PALETTES[settings.retroDuotone]?.high || RETRO_PALETTES["amber-classic"].high;
  }
  if (settings.colorMode === "green") {
    return { r: 110, g: 255, b: 175 };
  }
  if (settings.colorMode === "amber") {
    return { r: 255, g: 192, b: 118 };
  }
  if (settings.colorMode === "custom") {
    return hexToRgb(settings.customColor);
  }
  if (settings.colorMode === "color") {
    return { r: 176, g: 214, b: 255 };
  }
  return { r: 255, g: 255, b: 255 };
}

function applyBorderGlow(ctx, width, height, strength, settings) {
  const amount = clamp(Number(strength) || 0, 0, 1);
  if (amount <= 0.001) {
    return;
  }

  const color = glowColor(settings);
  const band = Math.max(10, Math.min(width, height) * (0.055 + amount * 0.24));
  const alpha = clamp(0.018 + amount * 0.34, 0, 0.62);
  const glow = `rgba(${color.r}, ${color.g}, ${color.b},`;

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const top = ctx.createLinearGradient(0, 0, 0, band);
  top.addColorStop(0, `${glow}${(alpha * 1.12).toFixed(3)})`);
  top.addColorStop(0.58, `${glow}${(alpha * 0.44).toFixed(3)})`);
  top.addColorStop(1, `${glow}0)`);
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, band);

  const bottom = ctx.createLinearGradient(0, height, 0, height - band);
  bottom.addColorStop(0, `${glow}${(alpha * 1.12).toFixed(3)})`);
  bottom.addColorStop(0.58, `${glow}${(alpha * 0.44).toFixed(3)})`);
  bottom.addColorStop(1, `${glow}0)`);
  ctx.fillStyle = bottom;
  ctx.fillRect(0, height - band, width, band);

  const left = ctx.createLinearGradient(0, 0, band, 0);
  left.addColorStop(0, `${glow}${alpha.toFixed(3)})`);
  left.addColorStop(0.58, `${glow}${(alpha * 0.4).toFixed(3)})`);
  left.addColorStop(1, `${glow}0)`);
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, band, height);

  const right = ctx.createLinearGradient(width, 0, width - band, 0);
  right.addColorStop(0, `${glow}${alpha.toFixed(3)})`);
  right.addColorStop(0.58, `${glow}${(alpha * 0.4).toFixed(3)})`);
  right.addColorStop(1, `${glow}0)`);
  ctx.fillStyle = right;
  ctx.fillRect(width - band, 0, band, height);

  ctx.restore();
}

function drawPolygon(ctx, x, y, radius, sides, rotation) {
  if (radius <= 0 || sides < 3) {
    return;
  }
  ctx.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

function drawHalftoneShape(ctx, shape, x, y, radius, rotationDegrees) {
  const rotation = (Number(rotationDegrees) || 0) * (Math.PI / 180);
  if (shape === "square") {
    if (Math.abs(rotation) < 0.0001) {
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
    return;
  }
  if (shape === "diamond") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    drawPolygon(ctx, 0, 0, radius, 4, Math.PI / 4);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (shape === "pentagon") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    drawPolygon(ctx, 0, 0, radius, 5, -Math.PI / 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (shape === "hexagon") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    drawPolygon(ctx, 0, 0, radius, 6, -Math.PI / 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function sourceDimensions(source) {
  if (!source) {
    return { width: 0, height: 0 };
  }
  if (source.type === "procedural") {
    return { width: 1280, height: 720 };
  }
  const element = source.element;
  if (!element) {
    return { width: 0, height: 0 };
  }
  return {
    width: element.videoWidth || element.naturalWidth || element.width || 0,
    height: element.videoHeight || element.naturalHeight || element.height || 0
  };
}

function shouldAnimate(settings, source, pointer, clickBursts) {
  if (!source) {
    return false;
  }
  if (source.type === "video" || source.type === "procedural") {
    return true;
  }
  if ((settings.overlayPreset || "none") !== "none") {
    return true;
  }
  if ((settings.mouseInteractionMode || "attract") !== "none" && (pointer.inside || clickBursts.length > 0)) {
    return true;
  }
  return false;
}

export class AsciiRenderer {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx =
      canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
      canvas.getContext("2d");
    this.sampleCanvas = document.createElement("canvas");
    this.sampleCtx =
      this.sampleCanvas.getContext("2d", { alpha: false, willReadFrequently: true }) ||
      this.sampleCanvas.getContext("2d");
    this.settings = { ...DEFAULT_SETTINGS };
    this.source = null;
    this.pointer = { inside: false, x: 0, y: 0 };
    this.clickBursts = [];
    this.callbacks = callbacks;
    this.frameRequest = null;
    this.lastFrame = null;
    this.lastRenderAt = 0;
    this.lastFpsWindowAt = 0;
    this.frameCounter = 0;
    this.fontMetricsCache = new Map();

    this.resizeObserver = new ResizeObserver(() => this.renderNow());
    if (this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement);
    }

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.loop = this.loop.bind(this);

    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
  }

  destroy() {
    if (this.frameRequest) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.renderNow();
  }

  setSource(source) {
    this.source = source;
    this.renderNow();
  }

  getLastFrame() {
    return this.lastFrame;
  }

  renderNow() {
    if (this.frameRequest) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.loop(performance.now());
  }

  schedule() {
    if (!this.frameRequest) {
      this.frameRequest = requestAnimationFrame(this.loop);
    }
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    this.pointer = {
      inside: true,
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height
    };
    this.renderNow();
  }

  handlePointerLeave() {
    this.pointer = { ...this.pointer, inside: false };
    this.renderNow();
  }

  handlePointerDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    this.pointer = { inside: true, x, y };
    this.clickBursts = [
      ...this.clickBursts.slice(-2),
      { x, y, startedAt: performance.now(), seed: Math.random() * Math.PI * 2 }
    ];
    this.renderNow();
  }

  loop(now) {
    this.frameRequest = null;
    const timeSeconds = now * 0.001;
    this.clickBursts = this.clickBursts.filter((burst) => now - burst.startedAt < CLICK_BURST_DURATION_MS);
    const result = this.renderToCanvas(this.canvas, {
      source: this.source,
      settings: this.settings,
      timeSeconds,
      pointer: this.pointer,
      clickBursts: this.clickBursts,
      exportScale: 1
    });
    this.lastFrame = result;

    this.frameCounter += 1;
    if (!this.lastFpsWindowAt) {
      this.lastFpsWindowAt = now;
    }
    const elapsed = now - this.lastFpsWindowAt;
    if (elapsed >= 500) {
      const fps = Math.round((this.frameCounter * 1000) / elapsed);
      this.frameCounter = 0;
      this.lastFpsWindowAt = now;
      this.callbacks.onFpsChange?.(Number.isFinite(fps) ? fps : 0);
    }

    if (shouldAnimate(this.settings, this.source, this.pointer, this.clickBursts)) {
      this.schedule();
    }
  }

  renderToCanvas(targetCanvas, options = {}) {
    const source = options.source ?? this.source;
    const settings = { ...this.settings, ...(options.settings || {}) };
    const pointer = options.pointer || { inside: false, x: 0, y: 0 };
    const clickBursts = options.clickBursts || [];
    const exportScale = clamp(options.exportScale || 1, 0.25, 8);
    const collectCells = options.collectCells === true;
    const timeSeconds = Number.isFinite(options.timeSeconds) ? options.timeSeconds : performance.now() * 0.001;
    const animationLoop = loopState(settings, source, timeSeconds);
    const ctx = targetCanvas.getContext("2d");
    if (!ctx || !this.sampleCtx) {
      return null;
    }

    const availableWidth = options.pixelWidth || Math.max(320, targetCanvas.parentElement?.clientWidth || targetCanvas.clientWidth || 960);
    const availableHeight = options.pixelHeight || Math.max(360, targetCanvas.parentElement?.clientHeight || targetCanvas.clientHeight || 720);
    const sourceSize = sourceDimensions(source);

    if (!source || (!sourceSize.width && source.type !== "procedural")) {
      targetCanvas.width = availableWidth;
      targetCanvas.height = Math.max(420, Math.round(availableHeight * 0.72));
      ctx.fillStyle = settings.backgroundColor;
      ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
      ctx.fillStyle = "#95a2c2";
      ctx.font = `16px ${settings.renderFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Upload an image or video to render ASCII art", targetCanvas.width / 2, targetCanvas.height / 2);
      return {
        cells: [],
        width: targetCanvas.width,
        height: targetCanvas.height,
        columns: 0,
        rows: 0,
        animated: false
      };
    }

    const sourceWidth = source.type === "procedural" ? 1280 : sourceSize.width;
    const sourceHeight = source.type === "procedural" ? 720 : sourceSize.height;
    const aspect = relativeAspect(settings.outputAspect, sourceWidth, sourceHeight);
    const scaledFontSize = clamp(settings.fontSize * exportScale, 6, 56);
    const spacing = clamp(settings.charSpacing ?? 1, 0.7, 2);
    const fontKey = `${scaledFontSize}|${settings.renderFont}|${spacing}`;
    let glyphMetrics = this.fontMetricsCache.get(fontKey);
    if (!glyphMetrics) {
      ctx.font = `${scaledFontSize}px ${settings.renderFont}`;
      glyphMetrics = {
        glyphWidth: Math.max(scaledFontSize * 0.45, ctx.measureText("M").width || scaledFontSize * 0.62) * spacing,
        glyphHeight: scaledFontSize * spacing
      };
      this.fontMetricsCache.set(fontKey, glyphMetrics);
    }
    const glyphWidth = glyphMetrics.glyphWidth;
    const glyphHeight = glyphMetrics.glyphHeight;
    const columns = Math.max(16, Math.floor(availableWidth / glyphWidth));
    const rows = Math.max(12, Math.round((1 / aspect) * columns * (glyphWidth / Math.max(glyphHeight, 1))));
    const renderWidth = Math.max(2, Math.floor(columns * glyphWidth));
    const renderHeight = Math.max(2, Math.ceil(rows * glyphHeight + glyphHeight * 0.06));

    if (targetCanvas.width !== renderWidth) {
      targetCanvas.width = renderWidth;
    }
    if (targetCanvas.height !== renderHeight) {
      targetCanvas.height = renderHeight;
    }
    ctx.font = `${scaledFontSize}px ${settings.renderFont}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    if (this.sampleCanvas.width !== columns) {
      this.sampleCanvas.width = columns;
    }
    if (this.sampleCanvas.height !== rows) {
      this.sampleCanvas.height = rows;
    }
    this.sampleCtx.clearRect(0, 0, columns, rows);

    if (source.type === "procedural") {
      const imageData = this.sampleCtx.createImageData(columns, rows);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = (row * columns + column) * 4;
          const color = proceduralColor(column, row, columns, rows, timeSeconds);
          imageData.data[index] = color.r;
          imageData.data[index + 1] = color.g;
          imageData.data[index + 2] = color.b;
          imageData.data[index + 3] = 255;
        }
      }
      this.sampleCtx.putImageData(imageData, 0, 0);
    } else {
      const { cropX, cropY, cropWidth, cropHeight } = cropRect(sourceWidth, sourceHeight, aspect);
      this.sampleCtx.drawImage(source.element, cropX, cropY, cropWidth, cropHeight, 0, 0, columns, rows);
    }

    const sample = this.sampleCtx.getImageData(0, 0, columns, rows);
    const luma = new Float32Array(columns * rows);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const sampleIndex = (row * columns + column) * 4;
        const pixel = {
          r: sample.data[sampleIndex],
          g: sample.data[sampleIndex + 1],
          b: sample.data[sampleIndex + 2]
        };
        const base = 0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b;
        luma[row * columns + column] = overlayIntensity(
          processLuma(base, settings),
          column,
          row,
          columns,
          rows,
          settings,
          timeSeconds,
          animationLoop
        );
      }
    }

    const dithered = applyDither(luma, columns, rows, settings);
    const glyphs = getGlyphSet(settings);

    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    const vignette = clamp(settings.vignette ?? 0, 0, 1);
    const globalOpacity = clamp(settings.opacity ?? 1, 0, 1);
    const inverseMix = clamp(settings.inverseDither ?? 0, 0, 3);
    const bgDither = clamp(settings.bgDither ?? 0, 0, 3);
    const interactionEnabled = (settings.mouseInteractionMode || "attract") !== "none";
    const interactionStrength = clamp(settings.hoverStrength ?? 24, 4, 64) * exportScale;
    const interactionArea = clamp(settings.mouseAreaSize ?? 180, 40, 640) * exportScale;
    const interactionSpread = clamp(settings.mouseSpread ?? 1, 0.25, 3);
    const interactionDirection = settings.mouseInteractionMode === "push" ? -1 : 1;
    const cells = collectCells ? [] : null;
    const inverseColor = invertCssColor(settings.backgroundColor);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const pixelIndex = index * 4;
        const pixel = {
          r: sample.data[pixelIndex],
          g: sample.data[pixelIndex + 1],
          b: sample.data[pixelIndex + 2]
        };

        const x = column * glyphWidth;
        const y = row * glyphHeight;
        const centerX = x + glyphWidth * 0.5;
        const centerY = y + glyphHeight * 0.5;
        const nx = columns > 1 ? (column / (columns - 1)) * 2 - 1 : 0;
        const ny = rows > 1 ? (row / (rows - 1)) * 2 - 1 : 0;
        const radial = clamp(1 - Math.sqrt(nx * nx + ny * ny) / Math.SQRT2, 0, 1);
        const vignetteGain = 1 - vignette + vignette * Math.pow(radial, 1 + vignette * 2);
        const opacity = globalOpacity * vignetteGain;
        if (opacity <= 0.002) {
          continue;
        }

        const baseValue = clamp(Math.round(dithered[index]), 0, 255);
        const liftedValue = clamp(Math.round(baseValue + radial * radial * 34), 0, 255);
        const inverseNoise = clamp(
          ((baseValue / 255 - 0.5) * (0.65 + inverseMix * 1.95) + 0.5) -
            (bayerNoise(column, row) * 0.72 +
              ((Math.sin(
                (column + 1) * 7.31 +
                  (row + 1) * 3.17 +
                  (animationLoop.enabled ? animationLoop.oscillation(2) : timeSeconds * 0.75)
              ) +
                1) *
                0.5) *
                0.28),
          0,
          1
        );
        const adjustedValue = clamp(Math.round(liftedValue + (255 - liftedValue * 2) * inverseNoise), 0, 255);
        const edge = settings.style === "dotcross" || settings.style === "braille" || settings.style === "particles"
          ? edgeStrength(dithered, column, row, columns, rows)
          : 0;

        if (bgDither > 0) {
          const noise = bayerNoise(column, row);
          const flicker =
            (Math.sin(
              (column + 1) * 7.31 +
                (row + 1) * 3.17 +
                (animationLoop.enabled ? animationLoop.oscillation(2) : timeSeconds * 0.75)
            ) +
              1) *
            0.5;
          const field = clamp((baseValue / 255) * (0.92 + bgDither * 0.9) - (noise * 0.72 + flicker * 0.28) + 0.34, 0, 1);
          if (field > 0.04) {
            const size = Math.max(0.45, Math.min(glyphWidth, glyphHeight) * clamp(0.18 + field * (0.85 + bgDither * 0.5), 0.12, 1));
            const color = styleColor(pixel, baseValue, settings);
            ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(field * (0.05 + bgDither * 0.34), 0, 1).toFixed(3)})`;
            ctx.fillRect(x + (glyphWidth - size) * 0.5, y + (glyphHeight - size) * 0.5, size, size);
          }
        }

        if (inverseNoise > 0.01) {
          const inverseOpacity = clamp(inverseNoise * (0.08 + inverseMix * 0.34), 0, 1);
          if (inverseOpacity > 0.005) {
            ctx.globalAlpha = opacity * inverseOpacity;
            ctx.fillStyle = inverseColor;
            ctx.fillRect(x, y, glyphWidth, glyphHeight);
          }
        }

        let offsetX = 0;
        let offsetY = 0;
        if (interactionEnabled && (pointer.inside || clickBursts.length > 0)) {
          if (pointer.inside) {
            const dx = pointer.x - centerX;
            const dy = pointer.y - centerY;
            const distance = Math.hypot(dx, dy);
            if (distance > 0.0001 && distance < interactionArea) {
              const impact = Math.pow(1 - distance / interactionArea, 1 / interactionSpread);
              const impulse = impact * impact * interactionStrength * interactionDirection;
              offsetX += (dx / distance) * impulse;
              offsetY += (dy / distance) * impulse;
            }
          }
          for (const burst of clickBursts) {
            const age = nowOrPerformance(timeSeconds) - burst.startedAt;
            const progress = clamp(age / CLICK_BURST_DURATION_MS, 0, 1);
            const dx = centerX - burst.x;
            const dy = centerY - burst.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= CLICK_BURST_RADIUS) {
              continue;
            }
            const ring = 1 - distance / CLICK_BURST_RADIUS;
            const force = CLICK_BURST_RADIUS * ring * (1 - progress * 0.55) * (1.25 + Math.sin(progress * Math.PI) * 0.45);
            const ux = distance > 0.0001 ? dx / distance : Math.cos((index + burst.seed) * 0.61803398875);
            const uy = distance > 0.0001 ? dy / distance : Math.sin((index + burst.seed) * 0.61803398875);
            offsetX += ux * force;
            offsetY += uy * force;
          }
        }

        const drawX = x + offsetX;
        const drawY = y + offsetY;
        const drawCenterX = centerX + offsetX;
        const drawCenterY = centerY + offsetY;
        const color = styleColor(pixel, adjustedValue, settings);
        const cssColor = toCssColor(color);
        const fillColor = inverseNoise > 0.12 ? invertCssColor(`#${((1 << 24) + (color.r << 16) + (color.g << 8) + color.b).toString(16).slice(1)}`) : cssColor;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = fillColor;

        if (settings.style === "halftone") {
          const size = clamp(settings.halftoneSize ?? 1, 0.4, 2.2);
          const rotation = clamp(settings.halftoneRotation ?? 0, -180, 180);
          const intensity = clamp(Math.pow(adjustedValue / 255, 0.92) * 0.82 + ((Math.sin((column * 0.82 + row * 0.33) * 1.55) + Math.cos((column * 0.27 - row * 0.94) * 1.25) + 2) * 0.25) * 0.18, 0, 1);
          const radius = Math.max(0.1, Math.min(glyphWidth, glyphHeight) * 0.5) * intensity * size;
          if (radius >= 0.35) {
            drawHalftoneShape(ctx, settings.halftoneShape || "circle", drawCenterX, drawCenterY, radius, rotation);
            if (collectCells) {
              cells.push({
                kind: "shape",
                shape: settings.halftoneShape || "circle",
                fill: cssColor,
                x: drawCenterX,
                y: drawCenterY,
                radius,
                rotation
              });
            }
          }
          continue;
        }

        if (settings.style === "line") {
          const angle =
            clamp(settings.lineRotation ?? 0, -180, 180) * (Math.PI / 180) +
            (((Math.sin((column * 0.79 + row * 0.41) * 1.37) + Math.cos((column * 0.33 - row * 0.93) * 1.09) + 2) * 0.25) - 0.5) * 0.55;
          const length =
            Math.max(0.8, Math.min(glyphWidth, glyphHeight) * clamp(settings.lineWidth ?? 1, 0.2, 2.5)) *
            clamp((adjustedValue / 255) * clamp(settings.lineLength ?? 1, 0.1, 2.5), 0.05, 1.5);
          if (length >= 0.6) {
            const radius = length * 0.5;
            const x1 = drawCenterX - Math.cos(angle) * radius;
            const y1 = drawCenterY - Math.sin(angle) * radius;
            const x2 = drawCenterX + Math.cos(angle) * radius;
            const y2 = drawCenterY + Math.sin(angle) * radius;
            ctx.lineWidth = clamp(settings.lineThickness ?? 1.6, 0.2, Math.max(0.2, Math.min(glyphWidth, glyphHeight) * 1.4));
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            if (collectCells) {
              cells.push({
                kind: "line",
                stroke: cssColor,
                strokeWidth: ctx.lineWidth,
                x1,
                y1,
                x2,
                y2
              });
            }
          }
          continue;
        }

        let styledValue = adjustedValue;
        if (settings.style === "braille") {
          styledValue = clamp(adjustedValue + 8 + edge * 40 + (settings.brailleVariant === "dense" ? 10 : settings.brailleVariant === "sparse" ? -4 : 4), 0, 255);
        }
        if (settings.style === "particles") {
          styledValue = clamp(adjustedValue + edge * 44 + (clamp(settings.particleDensity ?? 0.5, 0.05, 1) - 0.5) * 12, 0, 255);
        }
        if (settings.style === "claude") {
          styledValue = clamp(adjustedValue + 12, 0, 255);
        }
        if (settings.style === "retro") {
          styledValue = clamp(adjustedValue + clamp(settings.retroNoise ?? 0.45, 0, 1) * 24, 0, 255);
        }
        if (settings.style === "terminal" && settings.overlayPreset === "matrix") {
          styledValue = clamp(
            styledValue +
              (Math.sin((column + 1) * 2.17 + (animationLoop.enabled ? animationLoop.oscillation(5) : timeSeconds * 5.7)) +
                Math.cos((row + 1) * 1.93 - (animationLoop.enabled ? animationLoop.oscillation(4) : timeSeconds * 4.1))) *
                22,
            0,
            255
          );
        }

        const glyph = pickGlyph(styledValue, glyphs);
        if (glyph === " ") {
          continue;
        }

        ctx.fillText(glyph, drawX, drawY);
        if (collectCells) {
          cells.push({
            kind: "text",
            glyph,
            fill: cssColor,
            x: drawX,
            y: drawY,
            fontSize: scaledFontSize,
            fontFamily: settings.renderFont,
            width: glyphWidth,
            height: glyphHeight
          });
        }
      }
    }

    ctx.globalAlpha = 1;
    applyBorderGlow(ctx, renderWidth, renderHeight, settings.borderGlow, settings);

    return {
      cells,
      width: renderWidth,
      height: renderHeight,
      columns,
      rows,
      glyphWidth,
      glyphHeight,
      animated: shouldAnimate(settings, source, pointer, clickBursts),
      backgroundColor: settings.backgroundColor
    };
  }
}

function nowOrPerformance(timeSeconds) {
  return timeSeconds * 1000;
}
