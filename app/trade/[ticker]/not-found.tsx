import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-[600px] mx-auto px-6 py-32 text-center space-y-4">
      <h1 className="font-serif text-5xl">Ticker not found</h1>
      <p className="text-[var(--color-text-dim)]">
        We couldn't pull a quote for that symbol. Try searching again.
      </p>
      <Link
        href="/"
        className="inline-block mt-4 px-5 py-2 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
