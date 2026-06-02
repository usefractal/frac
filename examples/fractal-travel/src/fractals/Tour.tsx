import "@/index.css";

export interface TourProps {
  name: string;
  location: string;
  duration: string;
  price: string;
  intensity?: "easy" | "moderate" | "active";
  highlights?: string[];
}

const intensityClasses = {
  active: "bg-orange-100 text-orange-800",
  easy: "bg-orange-50 text-orange-700",
  moderate: "bg-orange-50 text-orange-700",
};

export default function Tour({
  name,
  location,
  duration,
  price,
  intensity = "easy",
  highlights = [],
}: TourProps) {
  return (
    <article className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Tour
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{name}</h3>
          <p className="mt-1 text-sm text-slate-500">{location}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-slate-950">{price}</p>
          <p className="text-xs text-slate-500">{duration}</p>
        </div>
      </div>
      <span
        className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${intensityClasses[intensity]}`}
      >
        {intensity}
      </span>
      {highlights.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {highlights.map((highlight) => (
            <li className="flex gap-2 text-sm text-slate-700" key={highlight}>
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 flex justify-end">
        <button
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          type="button"
        >
          Book tour
        </button>
      </div>
    </article>
  );
}
