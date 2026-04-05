import express from "express";
import { googleLogin } from "../controllers/auth.controller.js";

const router = express.Router();

router.get("/google", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL ||
    "https://megan-ai.onrender.com/api/auth/google/callback";

  const clientId = process.env.GOOGLE_CLIENT_ID;

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    "&response_type=code" +
    "&scope=openid%20email%20profile" +
    "&access_type=offline" +
    "&prompt=consent";

  return res.redirect(url);
});

router.get("/google/callback", googleLogin);
router.post("/google", googleLogin);

export default router;