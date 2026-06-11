export default function Progress({
  steps,
  current,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {steps.map((label, i) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(i)}
          className={`relative h-1 flex-1 rounded-full transition-opacity before:absolute before:-inset-y-5 before:inset-x-0 before:content-[''] [@media(hover:hover)]:hover:opacity-70 ${
            i <= current ? "bg-primary" : "bg-muted"
          }`}
          aria-label={label}
          title={label}
        />
      ))}
    </div>
  );
}
