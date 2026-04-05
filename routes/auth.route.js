import { Router } from "express";
import {
  googleLogin,
  registerUser,
  loginUser,
  getMe,
} from "../controllers/auth.controller.js";

import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/*
  =========================
  AUTH PÚBLICO
  =========================
*/

// cadastro
router.post("/register", registerUser);

// login com email/senha
router.post("/login", loginUser);

// login com Google
router.post("/google", googleLogin);

// callback Google (OAuth)
router.get("/google/callback", googleLogin);

/*
  =========================
  AUTH PRIVADO
  =========================
*/

// dados do usuário logado
router.get("/me", requireAuth, getMe);

export default router;