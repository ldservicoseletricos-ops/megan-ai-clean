import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads");
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFileName(fileName) {
  const original = String(fileName || "").trim();

  const ext = path.extname(original);
  const base = path.basename(original, ext);

  const safeBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  const safeExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");

  return `${safeBase || "arquivo"}${safeExt || ""}`;
}

function buildStoredFileName(originalName) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  const safeName = sanitizeFileName(originalName);

  return `${timestamp}-${random}-${safeName}`;
}

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".json",
  ".zip",
  ".txt",
  ".md",
  ".csv",
  ".html",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

function isAllowedFile(file) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  const extension = path.extname(String(file?.originalname || "")).toLowerCase();

  return allowedMimeTypes.has(mimeType) || allowedExtensions.has(extension);
}

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    try {
      const finalName = buildStoredFileName(file.originalname);
      cb(null, finalName);
    } catch (error) {
      cb(error);
    }
  },
});

function fileFilter(_req, file, cb) {
  if (!isAllowedFile(file)) {
    return cb(
      new Error(
        "Tipo de arquivo não permitido. Envie PDF, DOCX, XLSX, PPTX, TXT, CSV, JSON, ZIP ou imagem."
      )
    );
  }

  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10,
  },
});

export function uploadErrorHandler(error, _req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        ok: false,
        error: `Arquivo excede o limite de ${MAX_FILE_SIZE_MB}MB`,
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        ok: false,
        error: "Quantidade máxima de 10 arquivos por envio excedida",
      });
    }

    return res.status(400).json({
      ok: false,
      error: error.message || "Erro no upload do arquivo",
    });
  }

  return res.status(400).json({
    ok: false,
    error: error.message || "Falha ao enviar arquivo",
  });
}

export function getUploadDir() {
  ensureUploadDir();
  return UPLOAD_DIR;
}

export default upload;