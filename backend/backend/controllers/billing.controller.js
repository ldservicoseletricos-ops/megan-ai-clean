import Stripe from "stripe";

let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  console.log("[STRIPE] Ativado");
} else {
  console.warn("[STRIPE] NÃO CONFIGURADO - modo seguro ativo");
}

function getFrontendUrl() {
  return String(process.env.FRONTEND_URL || "http://localhost:5173")
    .trim()
    .replace(/\/+$/, "");
}

export async function createCheckoutSession(req, res) {
  try {
    if (!stripe) {
      return res.status(200).json({
        ok: false,
        message: "Stripe não configurado",
      });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(200).json({
        ok: false,
        message: "STRIPE_PRICE_ID não configurado",
      });
    }

    const frontendUrl = getFrontendUrl();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/success`,
      cancel_url: `${frontendUrl}/cancel`,
    });

    return res.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    console.error("[STRIPE ERROR][createCheckoutSession]", error);
    return res.status(500).json({
      ok: false,
      error: "Erro no Stripe",
    });
  }
}

export async function stripeWebhook(req, res) {
  try {
    if (!stripe) {
      return res.status(200).send("Stripe não configurado");
    }

    return res.status(200).send("ok");
  } catch (error) {
    console.error("[STRIPE ERROR][webhook]", error);
    return res.status(500).send("Erro no webhook");
  }
}

export async function getBillingStatus(req, res) {
  try {
    return res.json({
      ok: true,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      priceConfigured: Boolean(process.env.STRIPE_PRICE_ID),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      mode: stripe ? "active" : "safe",
    });
  } catch (error) {
    console.error("[BILLING ERROR][getBillingStatus]", error);
    return res.status(500).json({
      ok: false,
      error: "Erro ao consultar billing",
    });
  }
}