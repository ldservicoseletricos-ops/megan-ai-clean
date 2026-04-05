import express from "express";
import {
  createCheckoutSession,
  stripeWebhook,
} from "../controllers/billing.controller.js";

const router = express.Router();

router.post("/create-checkout-session", createCheckoutSession);

// ⚠️ webhook precisa raw body
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

export default router;