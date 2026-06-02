import "@/index.css";

export interface HeroPanelProps {
  title: string;
  eyebrow?: string;
  body: string;
  tone?: "blue" | "green" | "amber";
}

const toneClasses = {
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  blue: "border-blue-200 bg-blue-50 text-blue-950",
  green: "border-emerald-200 bg-emerald-50 text-emerald-950",
};

export default function HeroPanel({
  title,
  eyebrow,
  body,
  tone = "blue",
}: HeroPanelProps) {
  return (
    <section className={`rounded-lg border p-5 ${toneClasses[tone]}`}>
      {eyebrow ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 opacity-80">{body}</p>
    </section>
  );
}
