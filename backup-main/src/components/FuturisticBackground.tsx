import { ParticleField } from "./ParticleField";

/**
 * Layered futuristic backdrop: neon gradients, digital grid, light rays,
 * wireframe polygons and a live particle field.
 */
export function FuturisticBackground({ grid = true }: { grid?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      {/* neon gradient orbs */}
      <div className="pulse-glow absolute -left-40 top-[-10rem] h-[38rem] w-[38rem] rounded-full bg-neon-blue/25 blur-[140px]" />
      <div className="pulse-glow absolute -right-52 top-40 h-[34rem] w-[34rem] rounded-full bg-neon-purple/25 blur-[150px]" />
      <div className="pulse-glow absolute bottom-[-14rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-neon-pink/20 blur-[150px]" />
      <div className="pulse-glow absolute left-1/2 top-1/3 h-[26rem] w-[26rem] rounded-full bg-neon-cyan/15 blur-[130px]" />

      {/* light rays */}
      <div className="absolute left-1/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-neon-cyan/30 to-transparent" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-gradient-to-b from-transparent via-neon-purple/25 to-transparent" />

      {/* digital grid floor */}
      {grid && (
        <div className="grid-floor absolute inset-x-0 bottom-0 h-2/3 [mask-image:linear-gradient(to_top,black,transparent)] opacity-60" />
      )}

      {/* wireframe polygons */}
      <svg
        className="float-slow absolute right-[8%] top-[18%] h-40 w-40 opacity-40"
        viewBox="0 0 100 100"
        fill="none"
      >
        <polygon
          points="50,5 95,30 95,75 50,97 5,75 5,30"
          stroke="oklch(0.85 0.15 197)"
          strokeWidth="0.6"
        />
        <polygon
          points="50,20 80,37 80,68 50,84 20,68 20,37"
          stroke="oklch(0.63 0.25 302)"
          strokeWidth="0.6"
        />
        <line x1="50" y1="5" x2="50" y2="97" stroke="oklch(0.72 0.24 350)" strokeWidth="0.3" />
      </svg>
      <svg
        className="float-slow absolute left-[6%] top-[55%] h-28 w-28 opacity-35 [animation-delay:2s]"
        viewBox="0 0 100 100"
        fill="none"
      >
        <rect
          x="18"
          y="18"
          width="64"
          height="64"
          stroke="oklch(0.66 0.2 262)"
          strokeWidth="0.8"
        />
        <rect
          x="32"
          y="32"
          width="36"
          height="36"
          stroke="oklch(0.85 0.15 197)"
          strokeWidth="0.8"
          transform="rotate(45 50 50)"
        />
      </svg>

      {/* holographic scanlines */}
      <div className="absolute inset-0 opacity-[0.05] [background-image:repeating-linear-gradient(0deg,white_0px,white_1px,transparent_1px,transparent_4px)]" />

      <ParticleField />
    </div>
  );
}
