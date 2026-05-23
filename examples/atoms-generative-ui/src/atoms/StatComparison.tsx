import "@/index.css";

export interface StatComparisonProps {
  label: string;
  before: string;
  after: string;
  delta: string;
  intent?: "neutral" | "positive" | "negative";
}

const intentClasses = {
  negative: "text-red-600 bg-red-50",
  neutral: "text-slate-600 bg-slate-50",
  positive: "text-emerald-600 bg-emerald-50",
};

export default function StatComparison({
  label,
  before,
  after,
  delta,
  intent = "neutral",
}: StatComparisonProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Before</p>
          <p className="text-lg font-semibold text-slate-700">{before}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">After</p>
          <p className="text-2xl font-semibold text-slate-950">{after}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${intentClasses[intent]}`}>
          {delta}
        </span>
      </div>
    </div>
  );
}
