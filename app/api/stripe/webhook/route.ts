import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import { getStripe, STRIPE_WEBHOOK_SECRET, isStripeConfigured } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

function adminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
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
        if (userId && session.subscription && session.customer) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await sb.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subId,
              status: sub.status,
              current_period_end: new Date((sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000).toISOString(),
              cancel_at_period_end: sub.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_subscription_id" }
          );
          await sb
            .from("profiles")
            .update({
              is_pro: ["active", "trialing"].includes(sub.status),
              pro_until: new Date((sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000).toISOString(),
            })
            .eq("id", userId);
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
        await sb.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_end: new Date((sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_subscription_id" }
        );
        if (userId) {
          await sb
            .from("profiles")
            .update({
              is_pro: ["active", "trialing"].includes(sub.status),
              pro_until: new Date((sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000).toISOString(),
            })
            .eq("id", userId);
        }
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
          await sb.from("profiles").update({ is_pro: false }).eq("id", userId);
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
