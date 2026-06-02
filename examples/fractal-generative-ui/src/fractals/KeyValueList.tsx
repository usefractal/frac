import "@/index.css";

export interface KeyValueListProps {
  title?: string;
  items: Array<{
    label: string;
    value: string;
  }>;
}

export default function KeyValueList({ title, items }: KeyValueListProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {title ? (
        <h3 className="mb-3 text-sm font-semibold text-slate-950">{title}</h3>
      ) : null}
      <dl className="divide-y divide-slate-100">
        {items.map((item) => (
          <div className="grid grid-cols-2 gap-4 py-2" key={item.label}>
            <dt className="text-sm text-slate-500">{item.label}</dt>
            <dd className="text-sm font-medium text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
