import "@/index.css";

export interface ChecklistProps {
  title?: string;
  items: Array<{
    label: string;
    done?: boolean;
  }>;
}

export default function Checklist({ title, items }: ChecklistProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {title ? (
        <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li className="flex items-center gap-2 text-sm" key={item.label}>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                item.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 bg-white text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={item.done ? "text-slate-500 line-through" : "text-slate-800"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
