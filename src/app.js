import {
  BRAILLE_VARIANT_LABELS,
  COLOR_MODE_LABELS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_SETTINGS,
  DIRECTION_OPTIONS,
  DITHER_LABELS,
  FONT_OPTIONS,
  GIF_RESOLUTIONS,
  HALFTONE_SHAPE_LABELS,
  IMAGE_FORMATS,
  IMAGE_RESOLUTIONS,
  INTERACTION_LABELS,
  OUTPUT_ASPECT_LABELS,
  OVERLAY_LABELS,
  RETRO_DUOTONE_LABELS,
  SOURCE_HINT,
  STYLE_LABELS,
  SVG_DENSITY_OPTIONS,
  SVG_MODE_LABELS,
  TERMINAL_CHARSET_LABELS,
  VIDEO_QUALITY_LABELS,
  VIDEO_RESOLUTIONS,
  CHARSET_LABELS
} from "./config.js";
import {
  copyCodeExport,
  downloadHtmlExport,
  exportAnimation,
  exportRaster,
  exportSvg
} from "./exporters.js";
import { AsciiRenderer } from "./renderer.js";

const app = document.querySelector("#app");

const state = {
  settings: structuredClone(DEFAULT_SETTINGS),
  exportSettings: structuredClone(DEFAULT_EXPORT_SETTINGS),
  source: null,
  busy: false,
  status: "Ready for upload.",
  exportStatus: "",
  exportProgress: 0,
  fps: 0,
  objectUrl: "",
  currentSourceLabel: "No source loaded",
  sourceMetaLabel: "Upload an image or video to begin."
};

app.innerHTML = `
  <div class="a7-shell">
    <section id="canvas-container">
      <div class="canvas-top-bar">
        <div class="canvas-top-brand">
          <a
            class="github-badge"
            href="https://github.com/jacksonwyt/ascii-makur.git"
            target="_blank"
            rel="noreferrer"
            aria-label="Open GitHub"
            title="GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 .5C5.65.5.5 5.65.5 12A11.5 11.5 0 0 0 8.36 22.7c.58.1.79-.25.79-.56l-.02-1.98c-3.19.69-3.87-1.53-3.87-1.53-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.69.08-.69 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.75.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.19 1.18a11.1 11.1 0 0 1 5.8 0c2.22-1.49 3.19-1.18 3.19-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.68 5.38-5.24 5.67.41.35.77 1.04.77 2.1l-.01 3.12c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
                fill="currentColor"
              />
            </svg>
          </a>
          <span class="canvas-source-label" id="sourceSummary"></span>
        </div>
        <div class="canvas-top-meta">
          <span id="sourceMeta"></span>
          <span id="fpsReadout">0 FPS</span>
        </div>
      </div>
      <div class="ascii-renderer">
        <canvas id="asciiCanvas" aria-label="ASCII art preview"></canvas>
      </div>
      <div class="canvas-bottom-bar">
        <span id="statusLine"></span>
      </div>
    </section>
    <aside class="ui-layer">
      <header class="hero-edition">
        <div class="hero-description">
          <span class="header-brand">ASCII editor</span>
          <p>
            Upload images or video, tune dithering, push styles past plain ASCII, and export web-ready
            assets directly from the browser.
          </p>
        </div>
        <div class="hero-title-group">
          <div class="ascii-mark">ASCII<br />MAKUR</div>
          <div class="hero-caption">Render. Distort. Export.</div>
        </div>
      </header>
      <div class="modular-grid">
        <section class="block span-2" id="sourcePanel"></section>
        <section class="block span-2" id="controlsPanel"></section>
        <section class="block span-2" id="exportPanel"></section>
      </div>
      <footer class="footer-controls">
        <div class="meta-specs">
          <div><span class="meta-key">STYLE</span><span class="meta-value" id="metaStyle"></span></div>
          <div><span class="meta-key">DITHER</span><span class="meta-value" id="metaDither"></span></div>
          <div><span class="meta-key">COLOR</span><span class="meta-value" id="metaColor"></span></div>
        </div>
        <div class="footer-action-stack">
          <div class="footer-actions">
            <button class="action-chip" id="randomButton" type="button">RANDOMIZE</button>
            <button class="action-chip" id="resetButton" type="button">RESET</button>
          </div>
        </div>
      </footer>
      <input id="fileInput" type="file" accept="image/*,video/*" hidden />
    </aside>
  </div>
`;

const canvas = document.querySelector("#asciiCanvas");
const fileInput = document.querySelector("#fileInput");
const sourcePanel = document.querySelector("#sourcePanel");
const controlsPanel = document.querySelector("#controlsPanel");
const exportPanel = document.querySelector("#exportPanel");
const sourceSummary = document.querySelector("#sourceSummary");
const sourceMeta = document.querySelector("#sourceMeta");
const statusLine = document.querySelector("#statusLine");
const fpsReadout = document.querySelector("#fpsReadout");
const metaStyle = document.querySelector("#metaStyle");
const metaDither = document.querySelector("#metaDither");
const metaColor = document.querySelector("#metaColor");
const randomButton = document.querySelector("#randomButton");
const resetButton = document.querySelector("#resetButton");

const renderer = new AsciiRenderer(canvas, {
  onFpsChange(fps) {
    state.fps = fps;
    fpsReadout.textContent = `${fps} FPS`;
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isVideoFile(file) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
}

function aspectLabel() {
  return OUTPUT_ASPECT_LABELS[state.settings.outputAspect] || OUTPUT_ASPECT_LABELS.source;
}

function setStatus(text) {
  state.status = text;
  statusLine.textContent = text;
}

function setExportStatus(text, progress = state.exportProgress) {
  state.exportStatus = text;
  state.exportProgress = progress;
  renderExportPanel();
}

function cleanupObjectUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = "";
  }
}

function destroySource() {
  cleanupObjectUrl();
  if (state.source?.element instanceof HTMLVideoElement) {
    state.source.element.pause();
    state.source.element.srcObject = null;
    state.source.element.src = "";
  }
  state.source = null;
  state.currentSourceLabel = "No source loaded";
  state.sourceMetaLabel = "Upload an image or video to begin.";
  renderer.setSource(null);
}

async function loadImage(url, fileName) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  state.source = { type: "image", element: image };
  state.currentSourceLabel = fileName;
  state.sourceMetaLabel = `${image.naturalWidth} × ${image.naturalHeight}`;
}

async function loadVideo(url, fileName) {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.load();
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error("Unable to load the selected video."));
  });
  await video.play().catch(() => {});
  state.source = { type: "video", element: video };
  state.currentSourceLabel = fileName;
  state.sourceMetaLabel = `${video.videoWidth} × ${video.videoHeight} / video`;
}

async function handleFile(file) {
  if (!file) {
    return;
  }
  state.busy = true;
  setStatus("Loading source...");
  renderPanels();
  destroySource();
  const url = URL.createObjectURL(file);
  state.objectUrl = url;
  try {
    if (isVideoFile(file)) {
      await loadVideo(url, file.name);
    } else {
      await loadImage(url, file.name);
    }
    renderer.setSource(state.source);
    setStatus("Source loaded.");
  } catch (error) {
    destroySource();
    setStatus(error instanceof Error ? error.message : "Unable to load the selected file.");
  } finally {
    state.busy = false;
    renderPanels();
  }
}

function maybeRenderControlOptionMap(map, currentValue, attrName) {
  return Object.entries(map)
    .map(
      ([value, label]) => `
        <button type="button" class="${currentValue === value ? "active" : ""}" data-${attrName}="${value}">
          ${label}
        </button>
      `
    )
    .join("");
}

function slider(setting, label, min, max, step, suffix = "") {
  const value = state.settings[setting];
  const precision = step < 1 ? 2 : 0;
  return `
    <div class="control-row">
      <div class="split-line">
        <span class="control-label">${label}</span>
        <span class="control-value" data-slider-value="${setting}" data-slider-precision="${precision}" data-slider-suffix="${suffix}">${Number(value).toFixed(precision).replace(/\.00$/, "")}${suffix}</span>
      </div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${setting}" data-live-range="true" />
    </div>
  `;
}

function select(setting, label, options) {
  const value = state.settings[setting];
  return `
    <div class="control-row">
      <label>${label}</label>
      <select class="control-select" data-setting="${setting}">
        ${Object.entries(options)
          .map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${value === optionValue ? "selected" : ""}>${optionLabel}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function directionButtons(setting, label) {
  return `
    <div class="control-row">
      <span class="control-label">${label}</span>
      <div class="tab-buttons fx-direction-tabs">
        ${DIRECTION_OPTIONS.map(
          (direction) => `
            <button
              type="button"
              class="direction-icon-button ${state.settings[setting] === direction.key ? "active" : ""}"
              data-direction-setting="${setting}"
              data-direction-value="${direction.key}"
              title="${direction.label}"
            >
              ${direction.icon}
            </button>
          `
        ).join("")}
      </div>
    </div>
  `;
}

function renderSourcePanel() {
  sourcePanel.innerHTML = `
    <div class="controls-panel interactive">
      <div class="control-grid-2">
        <div class="control-row">
          <label>Source Type</label>
          <div class="control-value">Image / Video Upload</div>
        </div>
        <div class="control-row">
          <label>Preview Aspect</label>
          <select class="control-select" data-setting="outputAspect">
            ${Object.entries(OUTPUT_ASPECT_LABELS)
              .map(([value, label]) => `<option value="${value}" ${state.settings.outputAspect === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </div>
      </div>
      <div class="upload-dropzone" id="uploadDropzone">
        <button type="button" class="export-copy" id="browseButton">${state.busy ? "PROCESSING..." : "BROWSE FILES"}</button>
        <div>Drop image/video or click to browse</div>
        <div class="upload-hint">${SOURCE_HINT}</div>
      </div>
    </div>
  `;
}

function renderControlsPanel() {
  const style = state.settings.style;
  const overlay = state.settings.overlayPreset;
  const styleControls = [];

  if (style === "classic") {
    styleControls.push(
      `<div class="control-grid-3">${select("renderFont", "Font", FONT_OPTIONS)}${select("charset", "Character Set", CHARSET_LABELS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
    if (state.settings.charset === "custom") {
      styleControls.push(`
        <div class="control-row">
          <label>Custom Character Sequence</label>
          <input class="control-text" type="text" maxLength="100" value="${state.settings.customCharset}" data-setting="customCharset" />
        </div>
      `);
    }
  } else if (style === "braille") {
    styleControls.push(
      `<div class="control-grid-3">${select("renderFont", "Font", FONT_OPTIONS)}${select("brailleVariant", "Braille Set", BRAILLE_VARIANT_LABELS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
  } else if (style === "halftone") {
    styleControls.push(
      `<div class="control-grid-3">${select("renderFont", "Font", FONT_OPTIONS)}${select("halftoneShape", "Halftone Shape", HALFTONE_SHAPE_LABELS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
    styleControls.push(slider("halftoneSize", "Halftone Size", 0.4, 2.2, 0.05, "x"));
    styleControls.push(slider("halftoneRotation", "Halftone Rotation", -180, 180, 1, "deg"));
  } else if (style === "retro") {
    styleControls.push(
      `<div class="control-grid-3">${select("renderFont", "Font", FONT_OPTIONS)}${select("retroDuotone", "Retro Duotone", RETRO_DUOTONE_LABELS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
    styleControls.push(slider("retroNoise", "Retro Noise", 0, 1, 0.05));
  } else if (style === "terminal") {
    styleControls.push(
      `<div class="control-grid-3">${select("renderFont", "Font", FONT_OPTIONS)}${select("terminalCharset", "Terminal Set", TERMINAL_CHARSET_LABELS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
  } else {
    styleControls.push(
      `<div class="control-grid-2">${select("renderFont", "Font", FONT_OPTIONS)}${select("ditherType", "Dither Algorithm", DITHER_LABELS)}</div>`
    );
  }

  if (style === "particles") {
    styleControls.push(slider("particleDensity", "Particle Density", 0.1, 1, 0.05));
    styleControls.push(`
      <div class="control-row">
        <label>Particle Char</label>
        <input class="control-text" type="text" maxLength="1" value="${state.settings.particleChar}" data-setting="particleChar" />
      </div>
    `);
  }

  if (style === "line") {
    styleControls.push(slider("lineLength", "Line Length", 0.1, 2.5, 0.05));
    styleControls.push(slider("lineWidth", "Line Width", 0.2, 2.5, 0.05));
    styleControls.push(slider("lineThickness", "Line Thickness", 0.2, 8, 0.1, "px"));
    styleControls.push(slider("lineRotation", "Line Rotation", -180, 180, 1, "deg"));
  }

  controlsPanel.innerHTML = `
    <div class="controls-panel interactive">
      <div class="control-row">
        <span class="control-label">Art Style</span>
        <div class="style-buttons">
          ${maybeRenderControlOptionMap(STYLE_LABELS, state.settings.style, "style")}
        </div>
      </div>
      ${styleControls.join("")}
      <div class="control-columns">
        <div class="control-column">
          ${slider("brightness", "Brightness", -50, 50, 1)}
          ${slider("bgDither", "BG Dither", 0, 3, 0.05)}
          ${slider("inverseDither", "Inverse Dither", 0, 3, 0.05)}
          ${slider("charSpacing", "Character Spacing", 0.7, 2, 0.05, "x")}
          ${slider("vignette", "Vignette", 0, 1, 0.05)}
        </div>
        <div class="control-column">
          ${slider("contrast", "Contrast", 0.5, 2.5, 0.1)}
          ${state.settings.ditherType !== "none" ? slider("ditherStrength", "Dither Strength", 0, 2, 0.05) : ""}
          ${slider("fontSize", "Font Size", 6, 20, 1, "px")}
          ${slider("opacity", "Opacity", 0, 1, 0.05)}
          ${slider("borderGlow", "Border Glow", 0, 1, 0.05)}
        </div>
      </div>
      <div class="control-row">
        <div class="control-row-head">
          <span class="control-label">Color Mode</span>
          <label class="check-line compact">
            <input type="checkbox" ${state.settings.invert ? "checked" : ""} data-setting="invert" data-bool="true" />
            <span>Invert Color</span>
          </label>
        </div>
        <div class="tab-buttons color-mode-tabs">
          ${maybeRenderControlOptionMap(COLOR_MODE_LABELS, state.settings.colorMode, "color-mode")}
        </div>
      </div>
      ${state.settings.colorMode === "custom" ? `
        <div class="control-row">
          <label>Custom Color</label>
          <input class="control-color" type="color" value="${state.settings.customColor}" data-setting="customColor" />
        </div>
      ` : ""}
      <div class="control-section control-section-separated">
        <div class="control-row">
          <span class="control-label">FX Preset</span>
          <div class="tab-buttons fx-preset-tabs">
            ${maybeRenderControlOptionMap(OVERLAY_LABELS, overlay, "overlay")}
          </div>
        </div>
        ${overlay !== "none" ? slider("overlayStrength", "FX Strength", 0.05, 1, 0.05) : ""}
        ${overlay === "noise" ? `${directionButtons("noiseDirection", "Direction")}${slider("noiseScale", "Noise Scale", 4, 96, 1)}${slider("noiseSpeed", "Noise Speed", 0, 3, 0.1)}` : ""}
        ${overlay === "intervals" ? `${directionButtons("intervalDirection", "Direction")}${slider("intervalSpacing", "Interval Spacing", 4, 36, 1)}${slider("intervalSpeed", "Interval Speed", 0, 3, 0.1)}${slider("intervalWidth", "Interval Width", 1, 8, 1)}` : ""}
        ${overlay === "beam" ? directionButtons("beamDirection", "Direction") : ""}
        ${overlay === "glitch" ? directionButtons("glitchDirection", "Direction") : ""}
        ${overlay === "crt" ? directionButtons("crtDirection", "Direction") : ""}
        ${overlay === "matrix" ? `${directionButtons("matrixDirection", "Direction")}${slider("matrixScale", "Matrix Scale", 6, 48, 1)}${slider("matrixSpeed", "Matrix Speed", 0.1, 3.5, 0.1)}` : ""}
      </div>
      <div class="control-section control-section-separated">
        <div class="control-row">
          <span class="control-label">Mouse Interaction</span>
          <div class="tab-buttons">
            ${maybeRenderControlOptionMap(INTERACTION_LABELS, state.settings.mouseInteractionMode, "interaction")}
          </div>
        </div>
        ${
          state.settings.mouseInteractionMode !== "none"
            ? `${slider("hoverStrength", "Hover Strength", 4, 64, 1)}${slider("mouseAreaSize", "Area Size", 40, 640, 1, "px")}${slider("mouseSpread", "Spread", 0.25, 3, 0.05, "x")}`
            : ""
        }
      </div>
      <div class="control-section control-section-separated">
        <div class="control-grid-2">
          ${select("outputAspect", "Aspect", OUTPUT_ASPECT_LABELS)}
          <div class="control-row">
            <label>Background</label>
            <input class="control-color" type="color" value="${state.settings.backgroundColor}" data-setting="backgroundColor" />
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderExportPanel() {
  exportPanel.innerHTML = `
    <div class="controls-panel interactive">
      <div class="control-row">
        <span class="control-label">Image Export</span>
      </div>
      <div class="control-grid-3">
        <div class="control-row">
          <label>File Name</label>
          <input class="control-text" type="text" value="${state.exportSettings.imageName}" data-export-setting="imageName" />
        </div>
        <div class="control-row">
          <label>Format</label>
          <select class="control-select" data-export-setting="imageFormat">
            ${IMAGE_FORMATS.map(
              (format) => `<option value="${format.value}" ${state.exportSettings.imageFormat === format.value ? "selected" : ""}>${format.label}</option>`
            ).join("")}
          </select>
        </div>
        <div class="control-row">
          <label>Resolution</label>
          <select class="control-select" data-export-setting="imageResolution">
            ${IMAGE_RESOLUTIONS.map(
              (resolution) => `<option value="${resolution}" ${state.exportSettings.imageResolution === resolution ? "selected" : ""}>${resolution}p</option>`
            ).join("")}
          </select>
        </div>
      </div>
      ${
        state.exportSettings.imageFormat !== "png"
          ? `
            <div class="control-row">
              <label>Quality</label>
              <input class="control-text" type="number" min="1" max="100" step="1" value="${state.exportSettings.imageQuality}" data-export-setting="imageQuality" />
            </div>
          `
          : ""
      }
      <div class="export-popover-actions">
        <button type="button" class="export-copy" id="exportImageButton" ${state.busy ? "disabled" : ""}>EXPORT IMAGE</button>
      </div>
      <div class="control-section control-section-separated">
        <div class="control-row">
          <span class="control-label">SVG Export</span>
        </div>
        <div class="control-grid-3">
          <div class="control-row">
            <label>File Name</label>
            <input class="control-text" type="text" value="${state.exportSettings.svgName}" data-export-setting="svgName" />
          </div>
          <div class="control-row">
            <label>Mode</label>
            <select class="control-select" data-export-setting="svgMode">
              ${Object.entries(SVG_MODE_LABELS)
                .map(([value, label]) => `<option value="${value}" ${state.exportSettings.svgMode === value ? "selected" : ""}>${label}</option>`)
                .join("")}
            </select>
          </div>
          <div class="control-row">
            <label>Density</label>
            <select class="control-select" data-export-setting="svgDensity">
              ${SVG_DENSITY_OPTIONS.map(
                (value) => `<option value="${value}" ${state.exportSettings.svgDensity === value ? "selected" : ""}>${value}x</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div class="control-grid-2">
          <label class="check-line">
            <input type="checkbox" ${state.exportSettings.svgIncludeBackground ? "checked" : ""} data-export-setting="svgIncludeBackground" data-export-bool="true" />
            <span>Include background</span>
          </label>
          <label class="check-line">
            <input type="checkbox" ${state.exportSettings.svgUseRenderedColors ? "checked" : ""} data-export-setting="svgUseRenderedColors" data-export-bool="true" />
            <span>Use rendered colors</span>
          </label>
        </div>
        ${
          !state.exportSettings.svgUseRenderedColors
            ? `
              <div class="control-row">
                <label>Mono Color</label>
                <input class="control-color" type="color" value="${state.exportSettings.svgMonoColor}" data-export-setting="svgMonoColor" />
              </div>
            `
            : ""
        }
        <div class="export-popover-actions">
          <button type="button" class="export-copy" id="exportSvgButton" ${state.busy ? "disabled" : ""}>EXPORT SVG</button>
        </div>
      </div>
      <div class="control-section control-section-separated">
        <div class="control-row">
          <span class="control-label">Animation Export</span>
        </div>
        <div class="control-grid-3">
          <div class="control-row">
            <label>File Name</label>
            <input class="control-text" type="text" value="${state.exportSettings.animationName}" data-export-setting="animationName" />
          </div>
          <div class="control-row">
            <label>Duration</label>
            <input class="control-text" type="number" min="1" max="30" step="1" value="${state.exportSettings.animationDuration}" data-export-setting="animationDuration" />
          </div>
          <div class="control-row">
            <label>FPS</label>
            <input class="control-text" type="number" min="1" max="60" step="1" value="${state.exportSettings.animationFps}" data-export-setting="animationFps" />
          </div>
        </div>
        <div class="control-grid-2">
          <div class="control-row">
            <label>GIF Resolution</label>
            <select class="control-select" data-export-setting="gifResolution">
              ${GIF_RESOLUTIONS.map(
                (value) => `<option value="${value}" ${state.exportSettings.gifResolution === value ? "selected" : ""}>${value}p</option>`
              ).join("")}
            </select>
          </div>
          <div class="control-row">
            <label>MP4 Resolution</label>
            <select class="control-select" data-export-setting="videoResolution">
              ${VIDEO_RESOLUTIONS.map(
                (value) => `<option value="${value}" ${state.exportSettings.videoResolution === value ? "selected" : ""}>${value}p</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div class="control-row">
          <label>MP4 Quality</label>
          <select class="control-select" data-export-setting="videoQuality">
            ${Object.entries(VIDEO_QUALITY_LABELS)
              .map(([value, label]) => `<option value="${value}" ${state.exportSettings.videoQuality === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </div>
        <div class="export-popover-actions export-popover-actions-split">
          <button type="button" class="export-copy" id="exportGifButton" ${state.busy ? "disabled" : ""}>EXPORT GIF</button>
          <button type="button" class="export-copy" id="exportMp4Button" ${state.busy ? "disabled" : ""}>EXPORT MP4</button>
        </div>
        ${
          state.exportStatus
            ? `
              <div class="save-status">
                <div>${state.exportStatus}</div>
                ${state.exportProgress > 0 ? `<div class="progress-meter"><span style="width:${Math.round(state.exportProgress * 100)}%"></span></div>` : ""}
              </div>
            `
            : ""
        }
      </div>
      <div class="control-section control-section-separated">
        <div class="control-row">
          <span class="control-label">Code Export</span>
        </div>
        <p class="export-note">
          HTML and React exports stay live by embedding the renderer runtime. SVG and image exports remain single-frame by design.
        </p>
        <div class="export-popover-actions export-popover-actions-split">
          <button type="button" class="export-copy" id="copyHtmlButton" ${state.busy ? "disabled" : ""}>COPY HTML</button>
          <button type="button" class="export-copy" id="copyReactButton" ${state.busy ? "disabled" : ""}>COPY REACT</button>
        </div>
        <div class="export-popover-actions">
          <button type="button" class="export-copy" id="downloadHtmlButton" ${state.busy ? "disabled" : ""}>DOWNLOAD HTML</button>
        </div>
      </div>
    </div>
  `;
}

function renderMeta() {
  sourceSummary.textContent = state.currentSourceLabel;
  sourceMeta.textContent = state.sourceMetaLabel;
  metaStyle.textContent = STYLE_LABELS[state.settings.style];
  metaDither.textContent = DITHER_LABELS[state.settings.ditherType];
  metaColor.textContent = COLOR_MODE_LABELS[state.settings.colorMode];
  fpsReadout.textContent = `${state.fps} FPS`;
  statusLine.textContent = state.status;
}

function renderPanels() {
  renderSourcePanel();
  renderControlsPanel();
  renderExportPanel();
  renderMeta();
}

function formatSliderValue(value, precision, suffix) {
  return `${Number(value).toFixed(precision).replace(/\.00$/, "")}${suffix || ""}`;
}

function updateLiveSliderDisplay(setting, value) {
  const display = document.querySelector(`[data-slider-value="${setting}"]`);
  if (!display) {
    return;
  }
  const precision = Number(display.dataset.sliderPrecision || 0);
  const suffix = display.dataset.sliderSuffix || "";
  display.textContent = formatSliderValue(value, precision, suffix);
}

function updateSetting(setting, rawValue, isBoolean = false) {
  if (!(setting in state.settings)) {
    return;
  }
  const current = state.settings[setting];
  let nextValue = rawValue;
  if (isBoolean) {
    nextValue = Boolean(rawValue);
  } else if (typeof current === "number") {
    nextValue = Number(rawValue);
  }
  state.settings[setting] = nextValue;
  renderer.setSettings(state.settings);
  renderPanels();
}

function updateSettingLive(setting, rawValue) {
  if (!(setting in state.settings)) {
    return;
  }
  const current = state.settings[setting];
  const nextValue = typeof current === "number" ? Number(rawValue) : rawValue;
  state.settings[setting] = nextValue;
  updateLiveSliderDisplay(setting, nextValue);
  renderer.setSettings(state.settings);
  renderMeta();
}

function updateExportSetting(setting, rawValue, isBoolean = false) {
  if (!(setting in state.exportSettings)) {
    return;
  }
  const current = state.exportSettings[setting];
  let nextValue = rawValue;
  if (isBoolean) {
    nextValue = Boolean(rawValue);
  } else if (typeof current === "number") {
    nextValue = Number(rawValue);
  }
  state.exportSettings[setting] = nextValue;
  renderExportPanel();
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomizeSettings() {
  const next = structuredClone(DEFAULT_SETTINGS);
  next.style = randomChoice(Object.keys(STYLE_LABELS));
  next.colorMode = randomChoice(Object.keys(COLOR_MODE_LABELS));
  next.ditherType = randomChoice(Object.keys(DITHER_LABELS));
  next.overlayPreset = randomChoice(Object.keys(OVERLAY_LABELS));
  next.outputAspect = randomChoice(Object.keys(OUTPUT_ASPECT_LABELS));
  next.fontSize = Math.round(Math.random() * 8) + 8;
  next.charSpacing = clamp(Number((0.8 + Math.random() * 0.8).toFixed(2)), 0.7, 2);
  next.contrast = clamp(Number((0.8 + Math.random() * 1.4).toFixed(1)), 0.5, 2.5);
  next.brightness = Math.round(Math.random() * 80) - 40;
  next.opacity = clamp(Number((0.7 + Math.random() * 0.3).toFixed(2)), 0, 1);
  next.vignette = Number((Math.random() * 0.65).toFixed(2));
  next.borderGlow = Number((Math.random() * 0.85).toFixed(2));
  next.bgDither = Number((Math.random() * 2.4).toFixed(2));
  next.inverseDither = Number((Math.random() * 2.4).toFixed(2));
  next.hoverStrength = Math.round(Math.random() * 32) + 12;
  next.mouseAreaSize = Math.round(Math.random() * 220) + 110;
  next.mouseSpread = Number((0.5 + Math.random() * 1.7).toFixed(2));
  next.backgroundColor = randomChoice(["#000000", "#030712", "#101322", "#1a1309", "#0b1615", "#111827"]);
  next.customColor = randomChoice(["#00ff99", "#22d3ee", "#f97316", "#eab308", "#f43f5e", "#a78bfa"]);
  next.noiseDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.intervalDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.beamDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.glitchDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.crtDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.matrixDirection = randomChoice(DIRECTION_OPTIONS.map((direction) => direction.key));
  next.halftoneShape = randomChoice(Object.keys(HALFTONE_SHAPE_LABELS));
  next.retroDuotone = randomChoice(Object.keys(RETRO_DUOTONE_LABELS));
  next.terminalCharset = randomChoice(Object.keys(TERMINAL_CHARSET_LABELS));
  next.charset = randomChoice(Object.keys(CHARSET_LABELS));
  next.brailleVariant = randomChoice(Object.keys(BRAILLE_VARIANT_LABELS));
  next.mouseInteractionMode = randomChoice(Object.keys(INTERACTION_LABELS));
  next.particleChar = randomChoice(["*", "+", "x", "@", "#"]);
  state.settings = next;
  renderer.setSettings(state.settings);
  setStatus("Settings randomized.");
  renderPanels();
}

function resetSettings() {
  state.settings = structuredClone(DEFAULT_SETTINGS);
  renderer.setSettings(state.settings);
  setStatus("Settings reset.");
  renderPanels();
}

async function runExport(task) {
  if (state.busy) {
    return;
  }
  if (!state.source) {
    setStatus("Load a source before exporting.");
    return;
  }
  state.busy = true;
  setExportStatus("Preparing export...", 0);
  renderPanels();
  try {
    await task();
    setExportStatus("Export finished.", 1);
    setStatus("Export finished.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    setExportStatus(message, 0);
    setStatus(message);
  } finally {
    state.busy = false;
    renderPanels();
  }
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) {
    return;
  }

  if (target.dataset.style) {
    updateSetting("style", target.dataset.style);
    return;
  }
  if (target.dataset["colorMode"]) {
    updateSetting("colorMode", target.dataset.colorMode);
    return;
  }
  if (target.dataset.overlay) {
    updateSetting("overlayPreset", target.dataset.overlay);
    return;
  }
  if (target.dataset.interaction) {
    updateSetting("mouseInteractionMode", target.dataset.interaction);
    return;
  }
  if (target.dataset.directionSetting) {
    updateSetting(target.dataset.directionSetting, target.dataset.directionValue);
    return;
  }
  if (target.id === "browseButton" || target.closest("#uploadDropzone")) {
    if (!state.busy) {
      fileInput.click();
    }
    return;
  }
  if (target.id === "exportImageButton") {
    await runExport(() => exportRaster(renderer, state.source, state.settings, state.exportSettings));
    return;
  }
  if (target.id === "exportSvgButton") {
    await runExport(() => exportSvg(renderer, state.source, state.settings, state.exportSettings));
    return;
  }
  if (target.id === "exportGifButton") {
    await runExport(() =>
      exportAnimation(renderer, state.source, state.settings, state.exportSettings, "gif", {
        onProgress(progress) {
          setExportStatus("Rendering GIF...", progress);
        },
        onStatus(text) {
          setExportStatus(text, state.exportProgress);
        }
      })
    );
    return;
  }
  if (target.id === "exportMp4Button") {
    await runExport(() =>
      exportAnimation(renderer, state.source, state.settings, state.exportSettings, "mp4", {
        onProgress(progress) {
          setExportStatus("Rendering MP4...", progress);
        },
        onStatus(text) {
          setExportStatus(text, state.exportProgress);
        }
      })
    );
    return;
  }
  if (target.id === "copyHtmlButton") {
    await runExport(() =>
      copyCodeExport(renderer, state.source, state.settings, state.exportSettings, "html", {
        onProgress(progress) {
          setExportStatus("Rendering animated HTML export...", progress);
        },
        onStatus(text) {
          setExportStatus(text, state.exportProgress);
        }
      })
    );
    return;
  }
  if (target.id === "copyReactButton") {
    await runExport(() =>
      copyCodeExport(renderer, state.source, state.settings, state.exportSettings, "react", {
        onProgress(progress) {
          setExportStatus("Rendering animated React export...", progress);
        },
        onStatus(text) {
          setExportStatus(text, state.exportProgress);
        }
      })
    );
    return;
  }
  if (target.id === "downloadHtmlButton") {
    await runExport(() =>
      downloadHtmlExport(renderer, state.source, state.settings, state.exportSettings, {
        onProgress(progress) {
          setExportStatus("Rendering downloadable HTML export...", progress);
        },
        onStatus(text) {
          setExportStatus(text, state.exportProgress);
        }
      })
    );
    return;
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.dataset.liveRange === "true" && target.dataset.setting) {
    updateSettingLive(target.dataset.setting, target.value);
    return;
  }

  if (target.dataset.setting) {
    updateSetting(target.dataset.setting, target.dataset.bool === "true" ? target.checked : target.value, target.dataset.bool === "true");
    return;
  }

  if (target.dataset.exportSetting) {
    updateExportSetting(
      target.dataset.exportSetting,
      target.dataset.exportBool === "true" ? target.checked : target.value,
      target.dataset.exportBool === "true"
    );
    return;
  }

});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }
  if (target.dataset.liveRange === "true" && target.dataset.setting) {
    renderPanels();
  }
});

fileInput.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  await handleFile(target.files?.[0]);
  target.value = "";
});

sourcePanel.addEventListener("dragenter", (event) => {
  event.preventDefault();
});
sourcePanel.addEventListener("dragover", (event) => {
  event.preventDefault();
});
sourcePanel.addEventListener("drop", async (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    await handleFile(file);
  }
});

randomButton.addEventListener("click", randomizeSettings);
resetButton.addEventListener("click", resetSettings);

window.addEventListener("beforeunload", () => {
  destroySource();
  renderer.destroy();
});

renderPanels();
renderer.renderNow();
