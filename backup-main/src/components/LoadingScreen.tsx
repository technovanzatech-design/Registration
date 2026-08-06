import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { ParticleField } from "./ParticleField";
import { site } from "@/data/site";

const STEPS = [0, 25, 50, 75, 100];

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      const next = STEPS[index];
      if (next === undefined) {
        window.clearInterval(timer);
        window.setTimeout(() => setVisible(false), 600);
        window.setTimeout(onDone, 1200);
        return;
      }
      setProgress(next);
    }, 420);
    return () => window.clearInterval(timer);
  }, [onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, filter: "blur(12px)" }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background"
        >
          <div className="pulse-glow absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-blue/20 blur-[140px]" />
          <div className="grid-floor absolute inset-0 opacity-40 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
          <ParticleField density={60} />

          <div className="relative z-10 w-full max-w-md px-6 text-center">
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mx-auto mb-8 flex h-24 w-24 items-center justify-center"
            >
              <div className="glass glow-cyan relative flex h-24 w-24 items-center justify-center rounded-2xl">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-2 rounded-xl border border-dashed border-neon-purple/50"
                />
                <Cpu className="h-12 w-12 text-neon-cyan" strokeWidth={1.4} aria-hidden />

              </div>
            </motion.div>

            <p className="font-display text-2xl font-bold tracking-[0.3em] text-aurora">
              {site.symposium}
            </p>

            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="mt-3 text-sm tracking-[0.35em] text-muted-foreground uppercase"
            >
              Loading Symposium...
            </motion.p>

            <div className="relative mt-10 h-px w-full bg-border">
              <motion.div
                className="bg-aurora absolute inset-y-0 left-0 h-px"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
              <motion.div
                className="glow-cyan absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-cyan"
                animate={{ left: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              />
            </div>

            <div className="mt-6 font-display text-4xl font-bold text-foreground tabular-nums">
              {progress}
              <span className="text-neon-cyan">%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
