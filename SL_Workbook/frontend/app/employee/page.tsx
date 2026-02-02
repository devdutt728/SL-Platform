import Image from "next/image";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { backendUrl } from "@/lib/backend";

const apps = [
  {
    label: "SERVICE OPS",
    title: "IT Helpdesk",
    description: "Tickets, assets, SLAs, and support operations.",
    href: "/it",
    accent: "from-cyan-500/30 to-blue-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
    icon: <CircuitIcon />,
  },
  {
    label: "TALENT ENGINE",
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/dashboard",
    accent: "from-rose-500/30 to-orange-500/10",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
    icon: <OrbitIcon />,
  },
];

type UserSummary = {
  display_name?: string;
  full_name?: string;
  email?: string;
  roles?: string[];
  platform_role_name?: string;
  platform_role_code?: string;
  platform_role_names?: string[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function initialsFrom(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function firstNameFrom(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "User";
  const token = cleaned.split(/\s+/)[0] || cleaned;
  const withoutDomain = token.split("@")[0] || token;
  return withoutDomain ? withoutDomain[0].toUpperCase() + withoutDomain.slice(1) : "User";
}

const roleLabels: Record<string, string> = {
  hr_admin: "Superadmin",
  hr_exec: "HR",
  interviewer: "Interviewer",
  hiring_manager: "GL",
  approver: "Approver",
  viewer: "Viewer",
};

function roleFromUser(user: UserSummary | null) {
  if (!user) return "Member";
  const explicit = (user.platform_role_name || "").trim();
  if (explicit) return explicit;
  const names = (user.platform_role_names || []).filter(Boolean);
  if (names.length) return names[0];
  const roles = (user.roles || []).filter(Boolean);
  if (roles.length) return roleLabels[roles[0]] || roles[0];
  const code = (user.platform_role_code || "").trim();
  if (code) return roleLabels[code] || code;
  return "Member";
}

async function fetchCurrentUser(): Promise<UserSummary | null> {
  try {
    const res = await fetch(backendUrl("/auth/me"), {
      headers: await authHeaderFromCookie(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    return {
      display_name: asString(data.display_name),
      full_name: asString(data.full_name),
      email: asString(data.email),
      roles: Array.isArray(data.roles) ? (data.roles.filter((item) => typeof item === "string") as string[]) : [],
      platform_role_name: asString(data.platform_role_name),
      platform_role_code: asString(data.platform_role_code),
      platform_role_names: Array.isArray(data.platform_role_names)
        ? (data.platform_role_names.filter((item) => typeof item === "string") as string[])
        : [],
    };
  } catch {
    return null;
  }
}

export default async function EmployeeConsolePage() {
  const logoSrc = "/studio-lotus-logo.png";
  const user = await fetchCurrentUser();
  const displayName =
    asString(user?.display_name) || asString(user?.full_name) || asString(user?.email) || "User";
  const initials = initialsFrom(displayName);
  const firstName = firstNameFrom(displayName);
  const role = roleFromUser(user);

  return (
    <div className="page-shell min-h-screen pb-12 pt-24">
      <header className="employee-topbar">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-44">
            <Image src={logoSrc} alt="Studio Lotus" fill sizes="176px" className="object-contain" priority />
          </div>
          <div className="hidden sm:block text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-steel">
            Internal console
          </div>
        </div>
        <div className="employee-actions">
          <a href="/" className="public-button public-button--ghost">
            Public portal
          </a>
          <details className="employee-menu">
            <summary className="employee-user">
              <div className="employee-avatar">{initials}</div>
              <div className="hidden sm:block">
                <p className="employee-name">Hi {firstName},</p>
                <p className="employee-role">{role}</p>
              </div>
              <span className="employee-caret" aria-hidden="true" />
            </summary>
            <div className="employee-menu__panel">
              <a href="/api/auth/logout" className="employee-menu__item">
                Sign out
              </a>
            </div>
          </details>
        </div>
      </header>

      <div className="max-w-5xl">
        <h1 className="mt-10 text-4xl font-semibold text-slate-900 sm:text-5xl">
          Coordinate every workspace from one console.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-steel">
          Choose a module to continue. Each app has its own sign-in and workspace, wired to the same platform identity.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {apps.map((app) => (
          <a key={app.title} href={app.href} className="section-card workbook-card group">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`workbook-icon flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${app.accent}`}>
                  {app.icon}
                </div>
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-steel">{app.label}</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{app.title}</h2>
                </div>
              </div>
              <span className="workbook-open text-xs font-semibold text-steel">Open -&gt;</span>
            </div>
            <p className="mt-4 text-sm text-steel">{app.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {app.tags.map((tag) => (
                <span key={tag} className="workbook-chip text-xs font-semibold">
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3 text-xs text-steel">
        <span className="workbook-chip">Zero-trust gateways enabled</span>
        <span>Need access? Contact your admin to enable your role in the sl_platform directory.</span>
      </div>
    </div>
  );
}

function CircuitIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-900"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6h5m7 0h-2M6 12h12M6 18h2m6 0h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg
      className="h-5 w-5 text-slate-900"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4c3.3 0 6 3.6 6 8s-2.7 8-6 8-6-3.6-6-8 2.7-8 6-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 8c2.2-1.8 5.7-2.4 9.4-1.3 3.7 1.1 6.1 3.6 6.1 6.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.5" cy="13.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
