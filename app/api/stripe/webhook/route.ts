import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { getStripe, STRIPE_WEBHOOK_SECRET, isStripeConfigured, priceIdToPlan } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function periodEndIso(sub: Stripe.Subscription): string {
  const ts = sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  return new Date(ts * 1000).toISOString();
}

function planFromSub(sub: Stripe.Subscription): string {
  const priceId = sub.items.data[0]?.price?.id ?? "";
  return priceIdToPlan(priceId) ?? "pro";
}

async function syncSubscription(
  sb: ReturnType<typeof adminClient>,
  userId: string,
  sub: Stripe.Subscription
) {
  const plan = planFromSub(sub);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const periodEnd = periodEndIso(sub);
  const isActive = ["active", "trialing"].includes(sub.status);

  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      plan,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );

  await sb
    .from("profiles")
    .update({
      plan: isActive ? plan : "free",
      is_pro: isActive,
      pro_until: periodEnd,
    })
    .eq("id", userId);
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  const stripe = getStripe()!;

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json(
      { error: `Bad signature: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 }
    );
  }

  const sb = adminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (userId && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sb, userId, sub);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: existing } = await sb
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        const userId = (existing as { user_id: string } | null)?.user_id;
        if (userId) await syncSubscription(sb, userId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { data: existing } = await sb
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", sub.id)
          .maybeSingle();
        const userId = (existing as { user_id: string } | null)?.user_id;
        await sb
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        if (userId) {
          await sb.from("profiles").update({ is_pro: false, plan: "free" }).eq("id", userId);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook] error", e);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
