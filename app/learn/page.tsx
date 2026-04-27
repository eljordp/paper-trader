import { GLOSSARY } from "@/lib/glossary";

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "How paper trading works",
    body:
      "You start with $100,000 in fake money. Every buy and sell uses real, live market prices — you just don't risk real cash. The goal: practice making decisions before there's something on the line.",
  },
  {
    title: "What a strategy actually is",
    body:
      "A strategy = an entry rule + an exit rule + a position-size rule. Without all three, you don't have a strategy, you have a hunch. Track which rules made money and which didn't — that's how you learn faster than 99% of traders.",
  },
  {
    title: "The only thing that matters",
    body:
      "Risk management beats stock picking. A trader who picks 50% winners but cuts losses fast can outperform one who picks 70% winners but holds losers. Decide your max loss BEFORE you enter a trade — written down, not in your head.",
  },
  {
    title: "How to use this app",
    body:
      "1. Search a ticker (top bar). 2. Read the chart and key stats — hover any term you don't know. 3. Decide your buy size. 4. Enter the trade. 5. Watch it. Sell when your rule says to, not when you feel like it. 6. Review your history weekly. The patterns will jump out.",
  },
];

export default function LearnPage() {
  return (
    <div className="max-w-[900px] mx-auto px-6 py-8 space-y-12">
      <div>
        <h1 className="font-serif text-5xl">Learn</h1>
        <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-prose">
          Plain-English glossary and the principles behind every term you'll see in this app.
        </p>
      </div>

      <section className="space-y-6">
        {SECTIONS.map((s) => (
          <div key={s.title} className="space-y-2 max-w-prose">
            <h2 className="font-serif text-2xl">{s.title}</h2>
            <p className="text-[var(--color-text-dim)] leading-relaxed">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-3xl">Glossary</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
          {Object.entries(GLOSSARY).map(([key, entry]) => (
            <div key={key} className="px-6 py-5 space-y-2">
              <div className="flex items-baseline gap-3">
                <h3 className="font-serif text-xl">{entry.term}</h3>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                  {entry.short}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">{entry.detail}</p>
              {entry.example && (
                <p className="text-sm text-[var(--color-text-faint)] italic leading-relaxed">
                  e.g. {entry.example}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
