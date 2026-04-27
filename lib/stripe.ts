import Stripe from "stripe";
import type { Plan } from "@/lib/plans";

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

export const STRIPE_PRICE_IDS: Record<Exclude<Plan, "free">, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  vip: process.env.STRIPE_VIP_PRICE_ID ?? "",
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? "",
};

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!STRIPE_PRICE_IDS.pro;
}

export function priceIdToPlan(priceId: string): Plan | null {
  if (priceId === STRIPE_PRICE_IDS.pro) return "pro";
  if (priceId === STRIPE_PRICE_IDS.vip) return "vip";
  if (priceId === STRIPE_PRICE_IDS.enterprise) return "enterprise";
  return null;
}
