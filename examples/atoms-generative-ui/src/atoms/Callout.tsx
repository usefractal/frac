import "@/index.css";

export interface CalloutProps {
  title: string;
  body: string;
  tone?: "info" | "success" | "warning" | "danger";
}

const toneClasses = {
  danger: "border-red-200 bg-red-50 text-red-950",
  info: "border-blue-200 bg-blue-50 text-blue-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

export default function Callout({
  title,
  body,
  tone = "info",
}: CalloutProps) {
  return (
    <aside className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 opacity-80">{body}</p>
    </aside>
  );
}
