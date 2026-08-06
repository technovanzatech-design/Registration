import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { rules, site } from "@/data/site";
import { SectionHeading, Reveal } from "@/components/SectionHeading";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "Rules & Guidelines — TECHNOVANZA 2026" },
      {
        name: "description",
        content:
          "Official participation rules for TECHNOVANZA 2026: ID requirements, event limits, reporting time, discipline and certification policy.",
      },
      { property: "og:title", content: "Rules & Guidelines — TECHNOVANZA 2026" },
      {
        property: "og:description",
        content: "Read the participation guidelines before registering for TECHNOVANZA 2026.",
      },
    ],
  }),
  component: RulesPage,
});

function RulesPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 pt-36 pb-10">
      <SectionHeading
        eyebrow="Guidelines"
        title={
          <>
            RULES & <span className="text-aurora">REGULATIONS</span>
          </>
        }
        subtitle="Please read carefully. These apply to every participant across all eight events."
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {rules.map((rule, i) => (
          <Reveal key={rule} delay={i * 0.05}>
            <div className="glass group h-full rounded-2xl border border-border p-6 transition-all hover:-translate-y-1 hover:border-neon-purple/60">
              <div className="flex items-start gap-4">
                <span className="font-display text-2xl font-bold text-neon-purple/70 transition-colors group-hover:text-neon-purple">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">{rule}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.2}>
        <div className="glass mt-10 flex flex-col items-start gap-4 rounded-2xl border border-neon-cyan/30 p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="h-8 w-8 shrink-0 text-neon-cyan" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            For clarifications, contact the student coordinator{" "}
            <span className="text-foreground">{site.studentCoordinator.name}</span> at{" "}
            <span className="text-neon-cyan">{site.studentCoordinator.phone}</span>.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
