import "@/index.css";

export interface TravelPlanProps {
  title: string;
  destination: string;
  days: number;
  budget: string;
  summary: string;
  items?: Array<{
    day: string;
    title: string;
    body: string;
  }>;
}

export default function TravelPlan({
  title,
  destination,
  days,
  budget,
  summary,
  items = [],
}: TravelPlanProps) {
  return (
    <section className="rounded-lg border border-orange-200 bg-orange-50 p-5 text-orange-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
        Travel plan
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-orange-700">{destination}</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-orange-700">
            {days} days
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-orange-700">
            {budget}
          </span>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-orange-900">{summary}</p>
      {items.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {items.map((item) => (
            <li className="rounded-md bg-white p-3" key={`${item.day}-${item.title}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
                {item.day}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
