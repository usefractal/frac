import "@/index.css";

export interface TimelineProps {
  title?: string;
  items: Array<{
    label: string;
    body: string;
    time?: string;
  }>;
}

export default function Timeline({ title, items }: TimelineProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {title ? (
        <h3 className="mb-4 text-sm font-semibold text-slate-950">{title}</h3>
      ) : null}
      <ol className="space-y-4">
        {items.map((item) => (
          <li className="flex gap-3" key={`${item.time ?? ""}-${item.label}`}>
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-medium text-slate-950">{item.label}</p>
                {item.time ? (
                  <p className="text-xs text-slate-500">{item.time}</p>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
