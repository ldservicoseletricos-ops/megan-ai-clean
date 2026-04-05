import { Router } from "express";
import { getWeather } from "../controllers/tools.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/weather", requireAuth, getWeather);

export default router;