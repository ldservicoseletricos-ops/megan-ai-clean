import express from "express";
import {
  googleCallbackController,
  googleStartController,
  loginController,
  meController,
  registerController,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.get("/me", requireAuth, meController);

router.get("/google/start", googleStartController);
router.get("/google/callback", googleCallbackController);

export { router as authRouter };
export default router;