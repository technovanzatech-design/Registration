import { motion } from "motion/react";

const LABELS = ["Personal", "Contact", "Events", "Review"];

/** Glowing horizontal progress line with a travelling ball. */
export function StepProgress({ step }: { step: number }) {
  const percent = Math.round(((step - 1) / (LABELS.length - 1)) * 100);
  const displayPercent = [0, 25, 50, 75, 100][step - 1] ?? percent;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex items-end justify-between">
        <span className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
          Step {step} of {LABELS.length}
        </span>
        <span className="font-display text-2xl font-bold text-aurora tabular-nums">
          {displayPercent}%
        </span>
      </div>

      <div className="relative h-px w-full bg-border">
        <motion.div
          className="bg-aurora absolute inset-y-0 left-0 h-px"
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        />
        <motion.span
          className="glow-cyan absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-cyan"
          animate={{ left: `${percent}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
        />
      </div>

      <div className="mt-4 flex justify-between">
        {LABELS.map((label, i) => (
          <span
            key={label}
            className={
              i + 1 <= step
                ? "text-xs font-medium text-foreground"
                : "text-xs text-muted-foreground/60"
            }
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
