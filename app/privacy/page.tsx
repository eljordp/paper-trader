export const metadata = {
  title: "Privacy Policy — Paper Trader",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-[700px] mx-auto px-6 py-16 space-y-8">
      <div>
        <h1 className="font-serif text-5xl tracking-tight">Privacy Policy</h1>
        <p className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider mt-2">
          Last updated April 27, 2026
        </p>
      </div>

      <div className="space-y-8 text-[var(--color-text-dim)] leading-relaxed">
        <Section title="What we collect">
          <p>To run Paper Trader, we collect:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><span className="text-[var(--color-text)]">Email address</span> — required for sign-in via magic link</li>
            <li><span className="text-[var(--color-text)]">Trading activity</span> — your simulated trades, positions, and account balances</li>
            <li><span className="text-[var(--color-text)]">Notes</span> — anything you write in your trade journal</li>
            <li><span className="text-[var(--color-text)]">Payment info</span> — handled by Stripe (we never see your card)</li>
            <li><span className="text-[var(--color-text)]">Usage analytics</span> — basic info like pages visited and feature usage</li>
          </ul>
        </Section>

        <Section title="What we don't collect">
          <p>
            We don&apos;t collect your real brokerage credentials, real bank info, social security
            number, or any other sensitive financial identifier. We don&apos;t need that — this is
            paper trading.
          </p>
        </Section>

        <Section title="How we use your data">
          <p>To make the product work:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Authenticate your account via Supabase</li>
            <li>Store and display your trading history and account state</li>
            <li>Process subscription payments via Stripe</li>
            <li>Send transactional emails (login links, receipts, eval results)</li>
            <li>Improve the product (aggregate analytics, never sold)</li>
          </ul>
        </Section>

        <Section title="Who we share with">
          <p>Service providers we rely on:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><span className="text-[var(--color-text)]">Supabase</span> — auth + database</li>
            <li><span className="text-[var(--color-text)]">Vercel</span> — hosting</li>
            <li><span className="text-[var(--color-text)]">Stripe</span> — payments and billing</li>
            <li><span className="text-[var(--color-text)]">Yahoo Finance</span> — market data feed</li>
          </ul>
          <p>
            We do not sell your data. We do not share it with advertisers. We will only disclose
            information if legally required.
          </p>
        </Section>

        <Section title="Your rights">
          <p>You can:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Export your trading data at any time</li>
            <li>Delete your account at any time (this wipes all your data)</li>
            <li>Cancel your subscription at any time</li>
            <li>Email us to request data correction or deletion</li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            We use cookies only for authentication (keeping you logged in) and basic analytics.
            We don&apos;t use third-party advertising cookies or cross-site trackers.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your trading data as long as your account is active. If you delete your account,
            we wipe your data within 30 days. We may retain anonymized aggregate analytics indefinitely.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We&apos;ll notify you by email or in-app of material changes to this policy. Continued
            use after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>Privacy questions? Email the team or reach out via the support link in the app.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="font-serif text-2xl text-[var(--color-text)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
