import "@/index.css";

export interface HotelProps {
  name: string;
  location: string;
  nightlyRate: string;
  rating: string;
  vibe: string;
  amenities?: string[];
}

export default function Hotel({
  name,
  location,
  nightlyRate,
  rating,
  vibe,
  amenities = [],
}: HotelProps) {
  return (
    <article className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
            Hotel
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{name}</h3>
          <p className="mt-1 text-sm text-slate-500">{location}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-slate-950">{nightlyRate}</p>
          <p className="text-xs text-slate-500">{rating} rating</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700">{vibe}</p>
      {amenities.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {amenities.map((amenity) => (
            <span
              className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700"
              key={amenity}
            >
              {amenity}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex justify-end">
        <button
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          type="button"
        >
          Book hotel
        </button>
      </div>
    </article>
  );
}
