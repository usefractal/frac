import "@/index.css";

export interface ProgressBarProps {
  label: string;
  value: number;
  max?: number;
  tone?: "blue" | "green" | "amber" | "red";
}

const toneClasses = {
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  red: "bg-red-500",
};

export default function ProgressBar({
  label,
  value,
  max = 100,
  tone = "blue",
}: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-950">{percent}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${toneClasses[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
