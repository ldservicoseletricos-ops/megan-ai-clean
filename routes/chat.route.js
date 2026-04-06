import express from "express";
import {
  chatController,
  getSessionMessagesController,
  listSessionsController,
  renameSessionController,
  streamChatController,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.post("/", chatController);
router.post("/stream", streamChatController);
router.get("/sessions", listSessionsController);
router.get("/sessions/:sessionId/messages", getSessionMessagesController);
router.patch("/sessions/:sessionId", renameSessionController);

export default router;
