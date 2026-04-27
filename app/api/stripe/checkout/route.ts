import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, STRIPE_PRICE_IDS, isStripeConfigured } from "@/lib/stripe";
import { PLANS, type Plan } from "@/lib/plans";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe not configured. Set STRIPE_SECRET_KEY + STRIPE_PRO_PRICE_ID." },
      { status: 503 }
    );
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const plan: Plan = (body?.plan as Plan) ?? "pro";
  if (plan === "free" || !PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json({ error: `${plan} price ID not configured` }, { status: 503 });
  }

  const stripe = getStripe()!;
  const origin = req.nextUrl.origin;

  // Look up or create stripe customer
  const { data: existingSub } = await sb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  let customerId =
    (existingSub as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
  }

  const trialDays = PLANS[plan].trialDays ?? 0;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?upgrade=success`,
    cancel_url: `${origin}/pro?canceled=1`,
    allow_promotion_codes: true,
    subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
    metadata: { user_id: user.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
