import Stripe from "stripe";
import { getPool } from "../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🔥 CRIAR CHECKOUT
export async function createCheckoutSession(req, res) {
  try {
    const { priceId, userId, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}?canceled=true`,
      metadata: {
        userId,
      },
    });

    return res.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}

// 🔥 WEBHOOK
export async function stripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  const db = getPool();

  // 🔥 PAGAMENTO CONFIRMADO
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const userId = session.metadata?.userId;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    await db.query(
      `
      UPDATE app_users
      SET
        stripe_customer_id = $1,
        stripe_subscription_id = $2,
        plan = 'pro',
        plan_message_limit = 500
      WHERE id = $3
    `,
      [customerId, subscriptionId, userId]
    );
  }

  // 🔥 CANCELAMENTO
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;

    await db.query(
      `
      UPDATE app_users
      SET
        plan = 'free',
        plan_message_limit = 20
      WHERE stripe_subscription_id = $1
    `,
      [subscription.id]
    );
  }

  res.json({ received: true });
}