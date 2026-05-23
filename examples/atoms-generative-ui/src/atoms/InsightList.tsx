import "@/index.css";

export interface InsightListProps {
  title?: string;
  items: string[];
}

export default function InsightList({ title, items }: InsightListProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {title ? (
        <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li className="flex gap-2 text-sm leading-6 text-slate-700" key={item}>
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
