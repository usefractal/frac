import "@/index.css";
import type { ReactNode } from "react";

export interface StackProps {
  gap?: "sm" | "md" | "lg";
  children?: ReactNode;
}

const gapClasses = {
  lg: "gap-5",
  md: "gap-3",
  sm: "gap-2",
};

export default function Stack({ gap = "md", children }: StackProps) {
  return <div className={`flex flex-col ${gapClasses[gap]}`}>{children}</div>;
}
