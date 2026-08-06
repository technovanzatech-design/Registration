import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Users, Phone, RotateCcw } from "lucide-react";
import type { SymposiumEvent } from "@/types";
import { EventIcon } from "./EventIcon";
import { cn } from "@/lib/utils";
import { useFlippedCard } from "@/context/FlippedCardContext";

const themes = {
  technical: {
    border: "border-neon-cyan/30 hover:border-neon-cyan/70",
    glow: "hover:shadow-[0_0_60px_-18px_oklch(0.85_0.15_197/0.9)]",
    icon: "text-neon-cyan bg-neon-cyan/10 border-neon-cyan/30",
    title: "text-neon-cyan",
    accent: "bg-neon-cyan",
  },
  "non-technical": {
    border: "border-neon-pink/30 hover:border-neon-pink/70",
    glow: "hover:shadow-[0_0_60px_-18px_oklch(0.72_0.24_350/0.9)]",
    icon: "text-neon-pink bg-neon-pink/10 border-neon-pink/30",
    title: "text-neon-pink",
    accent: "bg-neon-pink",
  },
} as const;

export function EventCard({
  event,
  index = 0,
}: {
  event: SymposiumEvent;
  index?: number;
}) {
  const { flippedId, toggle } = useFlippedCard();
  const flipped = flippedId === event.id;
  const theme = themes[event.category];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: "easeOut" }}
      className="[perspective:1600px]"
    >
      <motion.div
        whileHover={{ scale: 1.03, rotateX: 3, rotateY: -3 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        onClick={() => toggle(event.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(event.id);
          }
        }}
        aria-pressed={flipped}
        className="preserve-3d h-[29rem] cursor-pointer"
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="preserve-3d relative h-full w-full"
        >
          {/* FRONT */}
          <div
            className={cn(
              "glass backface-hidden absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-3xl border p-8 text-center transition-shadow duration-500",
              theme.border,
              theme.glow,
            )}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-2xl border",
                theme.icon,
              )}
            >
              <EventIcon name={event.icon} className="h-9 w-9" />
            </motion.div>

            <h3 className={cn("mt-6 font-display text-xl font-bold", theme.title)}>
              {event.name}
            </h3>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Max {event.maxParticipants}
            </p>

            <span className={cn("mt-6 h-px w-16", theme.accent)} />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(event.id);
              }}
              className="absolute inset-x-6 bottom-6 inline-flex items-center justify-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Click anywhere on this card to view event details.
            </button>
          </div>

          {/* BACK */}
          <div
            className={cn(
              "glass backface-hidden absolute inset-0 flex h-full flex-col overflow-hidden rounded-3xl border p-5 [transform:rotateY(180deg)]",
              theme.border,
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-3">
              <h3 className={cn("min-w-0 font-display text-base font-bold", theme.title)}>
                {event.name}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(event.id);
                }}
                aria-label="Flip back"
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-hidden">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {event.description}
              </p>

              <ul className="mt-2.5 space-y-1 text-[11px] leading-snug text-muted-foreground">
                {event.rules.slice(0, 3).map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span
                      className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", theme.accent)}
                    />
                    <span className="min-w-0">{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            <dl className="mt-3 grid shrink-0 grid-cols-2 gap-1.5 text-[10px]">
              <Detail icon={Clock} label="Duration" value={event.duration} />
              <Detail icon={Users} label="Team" value={event.teamSize} />
              <Detail icon={MapPin} label="Venue" value={event.venue} />
              <Detail icon={Phone} label={event.coordinator} value={event.contact} />
            </dl>

            <Link
              to="/registration"
              onClick={(e) => e.stopPropagation()}
              className="bg-aurora mt-3 inline-flex shrink-0 items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03]"
            >
              Register
            </Link>
          </div>

        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-secondary/30 p-1.5">
      <dt className="flex items-center gap-1.5 truncate text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-0.5 truncate font-medium text-foreground">{value}</dd>
    </div>

  );
}
