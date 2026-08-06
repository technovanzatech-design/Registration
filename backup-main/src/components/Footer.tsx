import { Linkedin, Mail, Phone, Cpu } from "lucide-react";
import { site } from "@/data/site";

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-2">
        <div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="glass glow-cyan flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              <Cpu className="h-7 w-7 text-neon-cyan" strokeWidth={1.6} aria-hidden />
            </span>

            <div>
              <p className="font-display text-lg font-bold text-aurora">{site.symposium}</p>
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                {site.theme}
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm text-muted-foreground">
            {site.college}
            <br />
            {site.department}
          </p>
         
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold tracking-widest text-foreground uppercase">
            Contact
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-neon-purple" />
              Registration help
            </li>
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neon-pink" />
              <a
                href={`mailto:${site.studentCoordinator.email}?subject=TECHNOVANZA%202026%20Registration%20Query`}
                className="break-all hover:text-neon-cyan"
              >
                {site.studentCoordinator.email}
              </a>
            </li>
            {site.registrationHelp.map((contact) => (
              <li key={contact.phone} className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-neon-purple" />
                <a href={`tel:+91${contact.phone}`} className="hover:text-neon-cyan">
                  {contact.name} · +91 {contact.phone}
                </a>
              </li>
            ))}
            <li className="text-xs leading-relaxed">{site.address}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {site.symposium} · {site.department} · {site.college}
      </div>
    </footer>
  );
}
