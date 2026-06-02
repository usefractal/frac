import "@/index.css";

export interface ActionRowProps {
  primary: string;
  secondary?: string;
}

export default function ActionRow({ primary, secondary }: ActionRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        type="button"
      >
        {primary}
      </button>
      {secondary ? (
        <button
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          type="button"
        >
          {secondary}
        </button>
      ) : null}
    </div>
  );
}
