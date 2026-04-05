import express from "express";
import {
  createCheckoutSession,
  getBillingStatus,
  stripeWebhook,
} from "../controllers/billing.controller.js";

const router = express.Router();

/* =========================
   BILLING
========================= */
router.get("/status", getBillingStatus);
router.post("/checkout", createCheckoutSession);
router.post("/webhook", stripeWebhook);

export default router;