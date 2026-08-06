import { Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { Menu, X, Cpu } from "lucide-react";

import { navLinks, site } from "@/data/site";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <nav
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-500 sm:px-6",
          scrolled ? "glass mx-4 shadow-lg" : "mx-4 bg-transparent",
        )}
      >
        <Link to="/" className="group flex min-w-0 items-center gap-3">
          <span className="glass glow-cyan flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl transition-transform group-hover:scale-110">
            <Cpu className="h-6 w-6 text-neon-cyan" strokeWidth={1.6} aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-sm font-bold tracking-[0.24em] text-aurora">
              {site.symposium}
            </span>
            <span className="block text-[10px] tracking-widest text-muted-foreground uppercase">
              AAMEC · CSE
            </span>
          </span>
        </Link>


        <ul className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="relative rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
                activeOptions={{ exact: link.to === "/" }}
              >
                {link.label}
                {pathname === link.to && (
                  <motion.span
                    layoutId="nav-underline"
                    className="bg-aurora absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full"
                  />
                )}
              </Link>
            </li>
          ))}
          <li className="ml-2">
            <Link
              to="/registration"
              className="bg-aurora glow-cyan inline-flex items-center rounded-xl px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
            >
              Register
            </Link>
          </li>
        </ul>

        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="glass flex h-10 w-10 items-center justify-center rounded-xl md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass mx-4 mt-2 space-y-1 rounded-2xl p-3 md:hidden"
          >
            {navLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
                  activeOptions={{ exact: link.to === "/" }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </header>
  );
}
