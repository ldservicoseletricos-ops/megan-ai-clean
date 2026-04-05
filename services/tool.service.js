import fs from "fs/promises";
import path from "path";
import { env } from "../config/env.js";
import { formatBytes, truncateText } from "../utils/formatter.js";
import { getRealWeather } from "./weather.service.js";
import { getTransitSnapshot } from "./transit.service.js";

function detectFileKind(file = {}) {
  const mime = String(file.mimetype || file.mimeType || "").toLowerCase();
  const name = String(file.originalname || file.originalName || "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";

  if (
    mime.includes("word") ||
    name.endsWith(".docx") ||
    name.endsWith(".doc")
  ) {
    return "document";
  }

  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".json") ||
    name.endsWith(".js") ||
    name.endsWith(".ts") ||
    name.endsWith(".tsx") ||
    name.endsWith(".css") ||
    name.endsWith(".html") ||
    name.endsWith(".xml") ||
    name.endsWith(".csv") ||
    name.endsWith(".sql") ||
    name.endsWith(".yaml") ||
    name.endsWith(".yml")
  ) {
    return "text";
  }

  return "file";
}

function buildStoragePublicName(storagePath = "") {
  return String(storagePath).replace(/\\/g, "/").split("/").pop() || "";
}

async function readPlainText(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return truncateText(content, 20000);
}

async function readPdfText(filePath) {
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = pdfParseModule.default || pdfParseModule;

  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);

  return truncateText(result?.text || "", 20000);
}

async function readDocxText(filePath) {
  const mammothModule = await import("mammoth");
  const mammoth = mammothModule.default || mammothModule;

  const result = await mammoth.extractRawText({ path: filePath });
  return truncateText(result?.value || "", 20000);
}

export async function fileToBase64DataUrl(
  filePath,
  mimeType = "application/octet-stream"
) {
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export async function extractFilePreview(file) {
  const kind = detectFileKind(file);
  const filePath = file.path || file.storagePath || "";
  const originalName = file.originalname || file.originalName || "arquivo";
  const mimeType = file.mimetype || file.mimeType || "";
  const sizeBytes = Number(file.size || file.sizeBytes || 0);

  const preview = {
    originalName,
    mimeType,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    storagePath: filePath,
    publicName: buildStoragePublicName(filePath),
    kind,
    previewText: null,
    previewStatus: "unavailable",
    multimodalReady: false,
  };

  try {
    if (kind === "text") {
      preview.previewText = await readPlainText(filePath);
      preview.previewStatus = preview.previewText ? "ok" : "empty";
      return preview;
    }

    if (kind === "pdf") {
      preview.previewText = await readPdfText(filePath);
      preview.previewStatus = preview.previewText ? "ok" : "empty";
      return preview;
    }

    if (kind === "document") {
      if (String(originalName).toLowerCase().endsWith(".docx")) {
        preview.previewText = await readDocxText(filePath);
        preview.previewStatus = preview.previewText ? "ok" : "empty";
      } else {
        preview.previewStatus = "unsupported";
      }
      return preview;
    }

    if (kind === "image") {
      preview.previewStatus = "metadata_only";
      preview.previewText =
        "Imagem enviada. Use visão multimodal quando disponível para descrever, analisar ou extrair contexto visual.";
      preview.multimodalReady = true;
      return preview;
    }

    preview.previewStatus = "unsupported";
    return preview;
  } catch {
    preview.previewStatus = "error";
    preview.previewText = `Não foi possível extrair preview de ${originalName}.`;
    return preview;
  }
}

export async function summarizeUploadedFiles(files = []) {
  const summaries = [];

  for (const file of files) {
    const preview = await extractFilePreview(file);

    summaries.push({
      originalName: preview.originalName,
      mimeType: preview.mimeType,
      sizeBytes: preview.sizeBytes,
      sizeLabel: preview.sizeLabel,
      storagePath: preview.storagePath,
      publicName: preview.publicName,
      kind: preview.kind,
      previewStatus: preview.previewStatus,
      previewText: preview.previewText,
      multimodalReady: preview.multimodalReady,
    });
  }

  return summaries;
}

export async function readTextFileSafe(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (
    [
      ".txt",
      ".md",
      ".json",
      ".js",
      ".ts",
      ".tsx",
      ".css",
      ".html",
      ".xml",
      ".csv",
      ".sql",
      ".yaml",
      ".yml",
    ].includes(ext)
  ) {
    return readPlainText(filePath);
  }

  if (ext === ".pdf") {
    try {
      return await readPdfText(filePath);
    } catch {
      return null;
    }
  }

  if (ext === ".docx") {
    try {
      return await readDocxText(filePath);
    } catch {
      return null;
    }
  }

  return null;
}

export function classifyFileSet(summarizedFiles = []) {
  const counts = {
    image: 0,
    pdf: 0,
    document: 0,
    text: 0,
    file: 0,
  };

  for (const file of summarizedFiles) {
    const kind = file?.kind || "file";
    counts[kind] = (counts[kind] || 0) + 1;
  }

  if (
    counts.image > 0 &&
    counts.pdf === 0 &&
    counts.document === 0 &&
    counts.text === 0
  ) {
    return "vision_analysis";
  }

  if (counts.pdf > 0 || counts.document > 0) {
    return "document_analysis";
  }

  if (counts.text > 0) {
    return "text_analysis";
  }

  return "generic_file_analysis";
}

export async function getPrimaryImageForMultimodal(files = []) {
  const imageFile = files.find((file) => detectFileKind(file) === "image");

  if (!imageFile?.path) return null;

  try {
    const dataUrl = await fileToBase64DataUrl(
      imageFile.path,
      imageFile.mimetype || "image/png"
    );

    return {
      originalName: imageFile.originalname || "imagem",
      mimeType: imageFile.mimetype || "image/png",
      dataUrl,
    };
  } catch {
    return null;
  }
}

export async function getWeatherSnapshot(locationInput = {}) {
  const lat = locationInput?.lat;
  const lon = locationInput?.lon;
  const city =
    locationInput?.city ||
    locationInput?.label ||
    locationInput?.formatted ||
    env.defaultWeatherCity;

  return await getRealWeather({ lat, lon, city });
}

export async function getTransitInfo(input = {}) {
  return await getTransitSnapshot(input);
}