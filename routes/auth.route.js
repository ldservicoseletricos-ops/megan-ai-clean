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

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", requireAuth, getMe);

router.get("/google/start", googleStartController);
router.get("/google/callback", googleCallbackController);

export { router as authRouter };
export default router;