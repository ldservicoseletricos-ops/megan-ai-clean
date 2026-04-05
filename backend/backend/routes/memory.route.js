import { Router } from "express";
import {
  createOrUpdateMemory,
  deleteMemoryByKey,
  listMemories,
} from "../controllers/memory.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, listMemories);
router.post("/", requireAuth, createOrUpdateMemory);
router.delete("/:key", requireAuth, deleteMemoryByKey);

export default router;