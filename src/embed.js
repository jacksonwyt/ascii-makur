import { DEFAULT_SETTINGS } from "./config.js";
import { AsciiRenderer } from "./renderer.js";

const EMBED_MESSAGE_TYPE = "ascii-makur:payload";
const EMBED_READY_TYPE = "ascii-makur:ready";

const canvas = document.querySelector("#embedCanvas");
const renderer = new AsciiRenderer(canvas);

let currentSource = null;

function destroySource() {
  if (currentSource?.element instanceof HTMLVideoElement) {
    currentSource.element.pause();
    currentSource.element.srcObject = null;
    currentSource.element.src = "";
  }
  currentSource = null;
  renderer.setSource(null);
}

async function loadImageSource(src) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return { type: "image", element: image };
}

async function loadVideoSource(src) {
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error("Unable to load embedded video source."));
  });
  await video.play().catch(() => {});
  return { type: "video", element: video };
}

async function materializeSource(payloadSource) {
  if (!payloadSource) {
    return null;
  }
  if (payloadSource.type === "image") {
    return loadImageSource(payloadSource.src);
  }
  if (payloadSource.type === "video") {
    return loadVideoSource(payloadSource.src);
  }
  return null;
}

async function applyPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const settings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}) };
  document.body.style.background = settings.backgroundColor || "#000000";
  destroySource();
  currentSource = await materializeSource(payload.source);
  renderer.setSettings(settings);
  renderer.setSource(currentSource);
}

window.addEventListener("message", async (event) => {
  if (!event.data || event.data.type !== EMBED_MESSAGE_TYPE) {
    return;
  }
  try {
    await applyPayload(event.data.payload);
  } catch (error) {
    destroySource();
    renderer.renderNow();
    console.error(error);
  }
});

window.parent?.postMessage({ type: EMBED_READY_TYPE }, "*");
renderer.renderNow();

window.addEventListener("beforeunload", () => {
  destroySource();
  renderer.destroy();
});
