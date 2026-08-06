import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function EventIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const registry = Icons as unknown as Record<string, LucideIcon>;
  const Icon = registry[name] ?? Icons.Sparkles;
  return <Icon className={className} strokeWidth={1.5} />;
}
