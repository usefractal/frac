import "@/index.css";

export interface BadgeProps {
  children: string;
  tone?: "slate" | "blue" | "green" | "amber" | "red";
}

const toneClasses = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

export default function Badge({ children, tone = "slate" }: BadgeProps) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
