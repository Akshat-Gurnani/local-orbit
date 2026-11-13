"use client";

import { Activity, Archive, FileText, Landmark, Moon, Orbit, Sun, Terminal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Project } from "@/db/types";
import { useLive } from "./use-live";

const NAV = [
  { href: "/", label: "Live", icon: Activity },
  { href: "/vault", label: "Vault", icon: Archive },
  { href: "/state", label: "State", icon: Landmark },
  { href: "/files", label: "Files", icon: FileText },
  { href: "/orbits", label: "Orbits", icon: Terminal },
];

const STORAGE_KEY = "orbit-project";

interface ProjectContextValue {
  projects: Project[];
  /** Empty string means all projects. */
  project: string;
  setProject: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue>({ projects: [], project: "", setProject: () => {} });
export const useProjects = () => useContext(ProjectContext);

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("orbit-theme", next);
    } catch {
      // The theme still applies for this page view.
    }
  };
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="rounded-md p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data } = useLive<{ projects: Project[] }>("/api/projects");
  const [project, setProjectState] = useState("");

  useEffect(() => {
    try {
      setProjectState(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      // Defaults to all projects.
    }
  }, []);

  const setProject = (id: string) => {
    setProjectState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // The selection still applies for this page view.
    }
  };

  const projects = data?.projects ?? [];
  // A saved project may have been removed since it was selected.
  const active = data && project && !projects.some((p) => p.id === project) ? "" : project;

  return (
    <ProjectContext.Provider value={{ projects, project: active, setProject }}>
      <div className="min-h-screen md:grid md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden border-r border-line md:sticky md:top-0 md:flex md:h-screen md:flex-col md:p-3">
          <div className="flex items-center gap-2 px-2 py-2">
            <Orbit size={18} className="text-accent" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Local Orbit</span>
          </div>
          <nav className="mt-4 flex flex-col gap-0.5" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const current = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${current ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface hover:text-ink"}`}
                >
                  <Icon size={15} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex items-center justify-between px-1">
            <span className="font-mono text-[11px] text-ink-3">local only</span>
            <ThemeToggle />
          </div>
        </aside>

        <div className="min-w-0 pb-20 md:pb-0">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 md:hidden">
            <div className="flex items-center gap-2">
              <Orbit size={16} className="text-accent" aria-hidden />
              <span className="text-sm font-semibold">Local Orbit</span>
            </div>
            <ThemeToggle />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-7">{children}</main>
        </div>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${pathname === href ? "text-accent" : "text-ink-2"}`}
            >
              <Icon size={17} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </ProjectContext.Provider>
  );
}

export function ProjectSelect({ allowAll = true, value, onChange }: { allowAll?: boolean; value?: string; onChange?: (id: string) => void }) {
  const { projects, project, setProject } = useProjects();
  return (
    <select
      aria-label="Project"
      className="field !w-auto max-w-52"
      value={value ?? project}
      onChange={(e) => (onChange ?? setProject)(e.target.value)}
    >
      {allowAll && <option value="">All projects</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
