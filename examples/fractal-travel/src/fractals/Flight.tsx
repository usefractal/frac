import "@/index.css";

export interface FlightProps {
  airline: string;
  route: string;
  depart: string;
  arrive: string;
  duration: string;
  price: string;
  stops?: string;
  cabin?: string;
}

export default function Flight({
  airline,
  route,
  depart,
  arrive,
  duration,
  price,
  stops = "Nonstop",
  cabin = "Economy",
}: FlightProps) {
  return (
    <article className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Flight
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{route}</h3>
          <p className="mt-1 text-sm text-slate-500">{airline}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-slate-950">{price}</p>
          <p className="text-xs text-slate-500">{cabin}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Depart</dt>
          <dd className="font-medium text-slate-800">{depart}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Arrive</dt>
          <dd className="font-medium text-slate-800">{arrive}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Duration</dt>
          <dd className="font-medium text-slate-800">{duration}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Stops</dt>
          <dd className="font-medium text-slate-800">{stops}</dd>
        </div>
      </dl>
      <div className="mt-5 flex justify-end">
        <button
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          type="button"
        >
          Book flight
        </button>
      </div>
    </article>
  );
}
