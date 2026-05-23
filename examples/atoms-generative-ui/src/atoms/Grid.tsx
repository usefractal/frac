import "@/index.css";
import type { ReactNode } from "react";

export interface GridProps {
  columns?: "2" | "3";
  gap?: "sm" | "md" | "lg";
  children?: ReactNode;
}

const columnClasses = {
  "2": "grid-cols-1 sm:grid-cols-2",
  "3": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

const gapClasses = {
  lg: "gap-5",
  md: "gap-3",
  sm: "gap-2",
};

export default function Grid({
  columns = "2",
  gap = "md",
  children,
}: GridProps) {
  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]}`}>
      {children}
    </div>
  );
}
