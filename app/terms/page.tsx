export const metadata = {
  title: "Terms of Service — Paper Trader",
};

export default function TermsPage() {
  return (
    <div className="max-w-[700px] mx-auto px-6 py-16 space-y-8">
      <div>
        <h1 className="font-serif text-5xl tracking-tight">Terms of Service</h1>
        <p className="text-xs text-[var(--color-text-faint)] uppercase tracking-wider mt-2">
          Last updated April 27, 2026
        </p>
      </div>

      <div className="space-y-8 text-[var(--color-text-dim)] leading-relaxed">
        <Section title="What this is">
          <p>
            Paper Trader is a paper trading simulator. You trade with simulated money against
            real market data feeds. No real funds are ever placed at risk through this service.
            All transactions are simulated for educational and practice purposes.
          </p>
        </Section>

        <Section title="What this isn't">
          <p>
            We are not a brokerage, an investment advisor, or a financial institution. We do not
            execute orders on real exchanges. We are not registered with the SEC, FINRA, or any
            regulatory body. Nothing on this site constitutes investment advice, a recommendation,
            or a solicitation to buy or sell any security.
          </p>
          <p>
            We are independent and not affiliated with FTMO, Topstep, Apex, MyFundedFutures, or
            any other proprietary trading firm. Eval rules implemented here approximate those
            firms&apos; published rules but may not match exactly or may be out of date.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for maintaining the confidentiality of your account credentials.
            You agree not to share your account or use the service to violate any law.
          </p>
          <p>
            We may suspend or terminate accounts that abuse the service, attempt to scrape or
            abuse the data feed, or violate these terms.
          </p>
        </Section>

        <Section title="Subscriptions and payments">
          <p>
            Pro subscriptions are billed monthly through Stripe. You can cancel at any time from
            the billing portal; cancellation takes effect at the end of your current billing period.
            We do not refund partial months.
          </p>
          <p>
            Subscription prices may change with 30 days&apos; notice via email.
          </p>
        </Section>

        <Section title="Data accuracy">
          <p>
            Market data is provided by third parties (currently Yahoo Finance) and may be delayed,
            incomplete, or inaccurate. We make no warranty as to the accuracy or timeliness of
            quotes, charts, news, or any other data displayed. Do not use this service as your
            sole source of market information for any real-money trading decision.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            The service is provided &quot;as is&quot; without warranty of any kind, express or implied,
            including but not limited to merchantability, fitness for a particular purpose, or
            non-infringement. We do not guarantee the service will be uninterrupted, error-free,
            or secure.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, Paper Trader and its operators are not liable
            for any indirect, incidental, special, consequential, or punitive damages arising
            out of or related to your use of the service. Our total liability for any claim is
            limited to the amount you have paid us in the 12 months preceding the claim.
          </p>
          <p>
            Most importantly: nothing here is investment advice. If you trade real money based on
            anything you learn, practice, or simulate here, you do so entirely at your own risk.
            Past performance — paper or otherwise — is not indicative of future results.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update these terms from time to time. Material changes will be communicated via
            email or in-app notice. Continued use of the service after changes constitutes acceptance.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions? Reach out via the support link in the app or email the team.</p>
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
