import express from "express";
import {
  healthCheck,
  systemStatusController,
} from "../controllers/system.controller.js";

const router = express.Router();

router.get("/health", healthCheck);
router.get("/status", systemStatusController);

export { router as systemRouter };
export default router;