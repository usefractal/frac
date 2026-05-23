import "@/index.css";

export interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  intent?: "neutral" | "positive" | "negative";
}

const intentClasses = {
  negative: "text-red-600",
  neutral: "text-slate-500",
  positive: "text-emerald-600",
};

export default function MetricCard({
  label,
  value,
  change,
  intent = "neutral",
}: MetricCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      {change ? (
        <p className={`mt-2 text-sm font-medium ${intentClasses[intent]}`}>
          {change}
        </p>
      ) : null}
    </article>
  );
}
