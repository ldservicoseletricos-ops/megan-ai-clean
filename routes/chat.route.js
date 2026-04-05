import { Router } from "express";
import {
  chatController,
  getSessionMessagesController,
  listSessionsController,
  streamChatController,
} from "../controllers/chat.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { upload } from "../middleware/upload.js";

const router = Router();

/*
  Sessões do usuário autenticado
*/
router.get("/sessions", requireAuth, listSessionsController);
router.get(
  "/sessions/:sessionId/messages",
  requireAuth,
  getSessionMessagesController
);

/*
  Chat com suporte a upload
*/
router.post(
  "/stream",
  requireAuth,
  upload.array("files", 10),
  streamChatController
);

router.post(
  "/",
  requireAuth,
  upload.array("files", 10),
  chatController
);

export default router;