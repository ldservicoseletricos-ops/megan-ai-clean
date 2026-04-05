import multer from "multer";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";

const uploadDir = path.resolve("uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: env.maxUploadFiles,
  },
});