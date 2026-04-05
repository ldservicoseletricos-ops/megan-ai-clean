import { Router } from "express";
import { healthCheck } from "../controllers/system.controller.js";

const router = Router();

// 🔥 rota principal
router.get("/", healthCheck);

// 🔥 rota health (mantém também)
router.get("/health", healthCheck);

export default router;