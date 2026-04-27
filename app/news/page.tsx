import NewsList from "@/components/NewsList";

export default function NewsPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="font-serif text-5xl">Market news</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2">
          Breaking news and major movers across the market. Click any ticker mention to dig in.
        </p>
      </div>
      <NewsList />
    </div>
  );
}
