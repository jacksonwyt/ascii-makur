const FFMPEG_CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const FFMPEG_MODULE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
const FFMPEG_UTIL_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

let ffmpegCachePromise = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extensionForAnimation(format) {
  return format === "gif" ? "gif" : format === "mp4" ? "mp4" : "webm";
}

function qualityPreset(quality) {
  switch (quality) {
    case "low":
      return { crf: 33, preset: "veryfast" };
    case "high":
      return { crf: 19, preset: "medium" };
    default:
      return { crf: 24, preset: "faster" };
  }
}

function computeExportDimensions(aspect, resolution) {
  if (aspect >= 1) {
    return {
      width: Math.round(resolution * aspect),
      height: Math.round(resolution)
    };
  }
  return {
    width: Math.round(resolution),
    height: Math.round(resolution / Math.max(aspect, 0.01))
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path when async clipboard access is blocked.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) {
    throw new Error("Clipboard access was blocked by the browser. Use DOWNLOAD HTML instead.");
  }
}

function escapeScriptContent(value) {
  return String(value).replaceAll("</script>", "<\\/script>");
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function loadFfmpeg() {
  if (ffmpegCachePromise) {
    return ffmpegCachePromise;
  }

  ffmpegCachePromise = (async () => {
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
      import(FFMPEG_MODULE_URL),
      import(FFMPEG_UTIL_URL)
    ]);

    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    return { ffmpeg, fetchFile };
  })();

  return ffmpegCachePromise;
}

async function transcodeWebm(blob, format, options = {}) {
  if (format !== "mp4" && format !== "gif") {
    return blob;
  }

  const { ffmpeg, fetchFile } = await loadFfmpeg();
  const inputName = `input-${Date.now()}.webm`;
  const outputName = `output-${Date.now()}.${format}`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(blob));
    if (format === "gif") {
      const fps = clamp(Number(options.fps) || 12, 1, 60);
      const resolution = clamp(Number(options.resolution) || 720, 160, 2160);
      await ffmpeg.exec([
        "-y",
        "-i",
        inputName,
        "-vf",
        `scale=${resolution}:-1:flags=lanczos,fps=${fps},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
        "-loop",
        "0",
        outputName
      ]);
      const data = await ffmpeg.readFile(outputName);
      return new Blob([data], { type: "image/gif" });
    }

    const preset = qualityPreset(options.quality);
    const fps = clamp(Number(options.fps) || 24, 12, 60);
    await ffmpeg.exec([
      "-y",
      "-i",
      inputName,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      preset.preset,
      "-crf",
      String(preset.crf),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      String(fps),
      outputName
    ]);
    const data = await ffmpeg.readFile(outputName);
    return new Blob([data], { type: "video/mp4" });
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

function fontFamilyForSvg(font) {
  return String(font || "")
    .split(",")
    .map((part) => part.trim().replaceAll('"', ""))
    .filter(Boolean)
    .join(", ");
}

function buildSvgMarkup(frame, exportSettings) {
  const mode = exportSettings.svgMode;
  const fillColor = exportSettings.svgUseRenderedColors ? null : exportSettings.svgMonoColor;
  const density = clamp(Number(exportSettings.svgDensity) || 1, 0.5, 2);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">`
  ];

  if (exportSettings.svgIncludeBackground) {
    parts.push(`<rect width="${frame.width}" height="${frame.height}" fill="${escapeXml(frame.backgroundColor)}" />`);
  }

  for (const cell of frame.cells) {
    const color = escapeXml(fillColor || cell.fill || "#ffffff");
    if (mode === "dots") {
      if (cell.kind === "line") {
        parts.push(
          `<line x1="${cell.x1.toFixed(2)}" y1="${cell.y1.toFixed(2)}" x2="${cell.x2.toFixed(2)}" y2="${cell.y2.toFixed(2)}" stroke="${color}" stroke-width="${(cell.strokeWidth * density).toFixed(2)}" stroke-linecap="round" />`
        );
        continue;
      }
      if (cell.kind === "shape") {
        parts.push(`<circle cx="${cell.x.toFixed(2)}" cy="${cell.y.toFixed(2)}" r="${(cell.radius * density).toFixed(2)}" fill="${color}" />`);
        continue;
      }
      parts.push(
        `<circle cx="${(cell.x + cell.width * 0.5).toFixed(2)}" cy="${(cell.y + cell.height * 0.5).toFixed(2)}" r="${(Math.min(cell.width, cell.height) * 0.23 * density).toFixed(2)}" fill="${color}" />`
      );
      continue;
    }

    if (cell.kind === "line") {
      parts.push(
        `<line x1="${cell.x1.toFixed(2)}" y1="${cell.y1.toFixed(2)}" x2="${cell.x2.toFixed(2)}" y2="${cell.y2.toFixed(2)}" stroke="${color}" stroke-width="${cell.strokeWidth.toFixed(2)}" stroke-linecap="round" />`
      );
      continue;
    }

    if (cell.kind === "shape") {
      parts.push(`<circle cx="${cell.x.toFixed(2)}" cy="${cell.y.toFixed(2)}" r="${cell.radius.toFixed(2)}" fill="${color}" />`);
      continue;
    }

    parts.push(
      `<text x="${cell.x.toFixed(2)}" y="${cell.y.toFixed(2)}" fill="${color}" font-family="${escapeXml(fontFamilyForSvg(cell.fontFamily))}" font-size="${cell.fontSize.toFixed(2)}" xml:space="preserve">${escapeXml(cell.glyph)}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

function embedOrigin(embedUrl) {
  try {
    return new URL(embedUrl).origin;
  } catch {
    return "*";
  }
}

function buildRuntimeHtmlDocument(embedUrl, payload, aspectRatio, backgroundColor, title = "ASCII Animation") {
  const serializedPayload = escapeScriptContent(JSON.stringify(payload));
  const targetOrigin = embedOrigin(embedUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: ${backgroundColor};
      }

      .ascii-animation {
        width: 100%;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: ${backgroundColor};
      }

      .ascii-frame {
        width: 100%;
        aspect-ratio: ${aspectRatio};
        border: 0;
        display: block;
        background: ${backgroundColor};
      }
    </style>
  </head>
  <body>
    <div class="ascii-animation">
      <iframe
        class="ascii-frame"
        id="asciiFrame"
        title="ASCII animation"
        loading="lazy"
        allow="autoplay"
        src="${embedUrl}"
      ></iframe>
    </div>
    <script>
      const payload = ${serializedPayload};
      const frame = document.getElementById("asciiFrame");
      const targetOrigin = ${JSON.stringify(targetOrigin)};

      function sendPayload() {
        if (!frame || !frame.contentWindow) {
          return;
        }
        frame.contentWindow.postMessage({ type: "ascii-makur:payload", payload }, targetOrigin);
      }

      frame.addEventListener("load", () => {
        sendPayload();
        setTimeout(sendPayload, 120);
      });

      window.addEventListener("message", (event) => {
        if (!event.data || event.data.type !== "ascii-makur:ready") {
          return;
        }
        if (targetOrigin !== "*" && event.origin !== targetOrigin) {
          return;
        }
        sendPayload();
      });
    </script>
  </body>
</html>`;
}

function buildRuntimeReactExport(embedUrl, payload, aspectRatio, backgroundColor) {
  const serializedPayload = JSON.stringify(payload, null, 2);
  const targetOrigin = embedOrigin(embedUrl);
  return `import React, { useEffect, useRef } from "react";

const EMBED_URL = ${JSON.stringify(embedUrl)};
const TARGET_ORIGIN = ${JSON.stringify(targetOrigin)};
const PAYLOAD = ${serializedPayload};

export function AsciiAnimation() {
  const frameRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }

    const sendPayload = () => {
      frame.contentWindow?.postMessage({ type: "ascii-makur:payload", payload: PAYLOAD }, TARGET_ORIGIN);
    };

    const handleLoad = () => {
      sendPayload();
      window.setTimeout(sendPayload, 120);
    };

    const handleMessage = (event) => {
      if (!event.data || event.data.type !== "ascii-makur:ready") {
        return;
      }
      if (TARGET_ORIGIN !== "*" && event.origin !== TARGET_ORIGIN) {
        return;
      }
      sendPayload();
    };

    frame.addEventListener("load", handleLoad);
    window.addEventListener("message", handleMessage);
    return () => {
      frame.removeEventListener("load", handleLoad);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "${backgroundColor}"
      }}
    >
      <iframe
        ref={frameRef}
        title="ASCII animation"
        src={EMBED_URL}
        loading="lazy"
        allow="autoplay"
        style={{
          width: "100%",
          aspectRatio: "${aspectRatio}",
          border: 0,
          display: "block",
          background: "${backgroundColor}"
        }}
      />
    </div>
  );
}

export default AsciiAnimation;
`;
}

async function sourceToDataUrl(source) {
  if (!source?.element) {
    throw new Error("No source available for code export.");
  }

  const src = source.element.currentSrc || source.element.src;
  if (!src) {
    throw new Error("Unable to serialize the current source.");
  }
  if (src.startsWith("data:")) {
    return src;
  }
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Unable to fetch the current source for export.");
  }
  return blobToDataUrl(await response.blob());
}

async function serializeSourceForEmbed(source, callbacks = {}) {
  if (!source) {
    throw new Error("No source available for code export.");
  }
  callbacks.onStatus?.("Serializing source asset...");
  return {
    type: source.type === "video" ? "video" : "image",
    src: await sourceToDataUrl(source)
  };
}

function buildEmbedUrl() {
  return new URL("embed.html", window.location.href).toString();
}

async function buildCodePayload(source, settings, callbacks = {}) {
  return {
    version: 1,
    source: await serializeSourceForEmbed(source, callbacks),
    settings
  };
}

async function prepareSourceForAnimation(source) {
  if (!source) {
    throw new Error("No source available for animation export.");
  }

  if (source.type === "image" || source.type === "procedural") {
    return { source, cleanup: () => {} };
  }

  const clone = document.createElement("video");
  clone.src = source.element.currentSrc || source.element.src;
  clone.muted = true;
  clone.playsInline = true;
  clone.loop = true;
  clone.crossOrigin = "anonymous";
  clone.preload = "auto";
  await new Promise((resolve, reject) => {
    clone.onloadeddata = resolve;
    clone.onerror = () => reject(new Error("Unable to prepare source video for export."));
  });
  clone.currentTime = source.element.currentTime || 0;
  await clone.play();
  return {
    source: { type: "video", element: clone },
    cleanup: () => {
      clone.pause();
      clone.src = "";
    }
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to serialize export."));
    };
    reader.onerror = () => reject(new Error("Failed to serialize export."));
    reader.readAsDataURL(blob);
  });
}

export async function exportRaster(renderer, source, settings, exportSettings) {
  const frame = renderer.getLastFrame();
  if (!frame) {
    throw new Error("Nothing to export yet.");
  }

  const aspect = frame.width / Math.max(1, frame.height);
  const dimensions = computeExportDimensions(aspect, exportSettings.imageResolution);
  const canvas = document.createElement("canvas");
  const exportScale = dimensions.height / Math.max(1, frame.height);
  renderer.renderToCanvas(canvas, {
    source,
    settings,
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
    timeSeconds: performance.now() * 0.001,
    exportScale,
    collectCells: false
  });

  const format = exportSettings.imageFormat;
  const formatInfo = {
    png: { mime: "image/png", extension: "png" },
    jpg: { mime: "image/jpeg", extension: "jpg" },
    webp: { mime: "image/webp", extension: "webp" }
  }[format];
  const quality = format === "png" ? undefined : clamp((Number(exportSettings.imageQuality) || 92) / 100, 0.1, 1);
  const blob = await canvasToBlob(canvas, formatInfo.mime, quality);
  triggerDownload(blob, `${exportSettings.imageName || "ascii-makur-export"}.${formatInfo.extension}`);
}

export async function exportSvg(renderer, source, settings, exportSettings) {
  const frame = renderer.getLastFrame();
  if (!frame) {
    throw new Error("Nothing to export yet.");
  }

  const canvas = document.createElement("canvas");
  const exportScale = 1;
  const svgFrame = renderer.renderToCanvas(canvas, {
    source,
    settings,
    pixelWidth: frame.width,
    pixelHeight: frame.height,
    timeSeconds: performance.now() * 0.001,
    exportScale,
    collectCells: true
  });

  const svg = buildSvgMarkup(svgFrame, exportSettings);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, `${exportSettings.svgName || "ascii-makur-export"}.svg`);
}

async function renderAnimationBlob(renderer, source, settings, exportSettings, format, callbacks = {}) {
  const preview = renderer.getLastFrame();
  if (!preview) {
    throw new Error("Nothing to export yet.");
  }
  if (typeof HTMLCanvasElement === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("Canvas stream capture is not supported in this browser.");
  }
  if (typeof window.MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const aspect = preview.width / Math.max(1, preview.height);
  const resolution = format === "gif" ? exportSettings.gifResolution : exportSettings.videoResolution;
  const dimensions = computeExportDimensions(aspect, resolution);
  const canvas = document.createElement("canvas");
  const fps = clamp(Number(exportSettings.animationFps) || 24, format === "gif" ? 1 : 12, 60);
  const duration = clamp(Number(exportSettings.animationDuration) || 6, 1, 30);
  const exportScale = dimensions.height / Math.max(1, preview.height);

  const mimeType =
    ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidate) =>
      window.MediaRecorder?.isTypeSupported(candidate)
    ) || "video/webm";

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data?.size) {
      chunks.push(event.data);
    }
  };

  const done = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Animation recording failed."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const prepared = await prepareSourceForAnimation(source);
  recorder.start(250);

  try {
    const startedAt = performance.now();
    const endsAt = startedAt + duration * 1000;
    while (performance.now() < endsAt) {
      const elapsed = (performance.now() - startedAt) * 0.001;
      renderer.renderToCanvas(canvas, {
        source: prepared.source,
        settings,
        pixelWidth: dimensions.width,
        pixelHeight: dimensions.height,
        timeSeconds: performance.now() * 0.001 + elapsed,
        exportScale,
        collectCells: false
      });
      callbacks.onProgress?.(clamp(elapsed / duration, 0, 1));
      await wait(1000 / fps);
    }
  } finally {
    prepared.cleanup();
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  let blob = await done;
  if (format === "gif" || format === "mp4") {
    callbacks.onStatus?.("Converting with FFmpeg...");
    blob = await transcodeWebm(blob, format, {
      fps,
      resolution,
      quality: exportSettings.videoQuality
    });
  }

  callbacks.onProgress?.(1);
  return blob;
}

export async function buildCodeExports(renderer, source, settings, exportSettings, callbacks = {}) {
  const frame = renderer.getLastFrame();
  if (!frame) {
    throw new Error("Nothing to export yet.");
  }

  callbacks.onStatus?.("Building live runtime export...");
  callbacks.onProgress?.(0.15);
  const embedUrl = buildEmbedUrl();
  const payload = await buildCodePayload(source, settings, callbacks);
  callbacks.onProgress?.(0.85);
  const backgroundColor = frame.backgroundColor || settings.backgroundColor || "#000000";
  const aspectRatio = `${frame.width} / ${frame.height}`;
  return {
    html: buildRuntimeHtmlDocument(embedUrl, payload, aspectRatio, backgroundColor),
    react: buildRuntimeReactExport(embedUrl, payload, aspectRatio, backgroundColor)
  };
}

export async function copyCodeExport(renderer, source, settings, exportSettings, format, callbacks = {}) {
  const exports = await buildCodeExports(renderer, source, settings, exportSettings, callbacks);
  const text = format === "react" ? exports.react : exports.html;
  await copyToClipboard(text);
}

export async function downloadHtmlExport(renderer, source, settings, exportSettings, callbacks = {}) {
  const exports = await buildCodeExports(renderer, source, settings, exportSettings, callbacks);
  const blob = new Blob([exports.html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, `${exportSettings.animationName || "ascii-makur-export"}.html`);
}

export async function exportAnimation(renderer, source, settings, exportSettings, format, callbacks = {}) {
  const blob = await renderAnimationBlob(renderer, source, settings, exportSettings, format, callbacks);
  triggerDownload(blob, `${exportSettings.animationName || "ascii-makur-export"}.${extensionForAnimation(format)}`);
}
