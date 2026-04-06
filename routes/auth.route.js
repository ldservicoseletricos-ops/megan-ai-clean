import express from "express";
import {
  googleCallbackController,
  googleStartController,
  loginUser,
  getMe,
  registerUser,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// =========================
// AUTH LOCAL
// =========================
router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", requireAuth, getMe);

// =========================
// AUTH GOOGLE (CORRIGIDO)
// =========================

// 👉 ROTA PRINCIPAL (FRONTEND USA ESSA)
router.get("/google", googleStartController);

// 👉 CALLBACK (GOOGLE USA ESSA)
router.get("/google/callback", googleCallbackController);

// (mantido compatibilidade com sua rota antiga)
router.get("/google/start", googleStartController);

export { router as authRouter };
export default router;