import type { ComponentProps, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  children,
  className,
  disabled,
  icon,
  loading,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & {
  icon?: ReactNode;
  loading?: boolean;
  variant?: "primary" | "secondary" | "cta";
}) {
  return (
    <button
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "secondary"
          ? "border border-border bg-transparent text-foreground hover:bg-muted"
          : "bg-primary text-white hover:brightness-95 dark:text-slate-950",
        variant === "cta" && "shadow-sm",
        className,
      )}
      disabled={disabled || loading}
      type="button"
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      className={cx(
        "rounded-lg border border-border bg-white/60 p-4 text-left transition-colors hover:bg-white/80 dark:bg-slate-900/60 dark:hover:bg-slate-900/80",
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"span">) {
  return <span className={cx("text-sm font-semibold", className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cx("block text-sm leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}
