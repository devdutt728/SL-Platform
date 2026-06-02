import Image from "next/image";
import { cookies } from "next/headers";
import { authHeaderFromCookie } from "@/lib/auth-server";
import { backendUrl } from "@/lib/backend";

const apps = [
  {
    label: "TALENT ENGINE",
    title: "Recruitment",
    description: "Candidates, pipelines, interviews, and offers.",
    href: "/recruitment/dashboard",
    accent: "from-[#E74011]/30 to-[#5D5552]/12",
    tags: ["Live Sync", "Encrypted access", "Audit-ready"],
    icon: <OrbitIcon />,
  },
  {
    label: "PROJECT CONTROL",
    title: "Project Planner",
    description: "Baselines, live plans, approvals, and schedule visibility.",
    href: "/employee/planner",
    accent: "from-[#0F766E]/28 to-[#0F172A]/12",
    tags: ["Role scoped", "Change control", "Live schedule"],
    icon: <GridOrbitIcon />,
  },
  {
    label: "OPERATING CONSOLE",
    title: "People & Org",
    description: "Employee master, org chart, licenses, systems, and peripherals.",
    href: "/people",
    accent: "from-[#244C66]/28 to-[#0F172A]/12",
    tags: ["Group org chart", "Encrypted PII", "Audit-ready"],
    icon: <PeopleIcon />,
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
  can_access_recruitment?: boolean;
  can_access_planner?: boolean;
  can_access_people?: boolean;
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
      can_access_recruitment: Boolean(data.can_access_recruitment),
      can_access_planner: Boolean(data.can_access_planner),
      can_access_people: Boolean(data.can_access_people),
    };
  } catch {
    return null;
  }
}

function plannerBackendUrl(path: string) {
  const base = process.env.PLANNER_BACKEND_URL || "http://127.0.0.1:8003";
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function probePlannerAccess(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("slp_token")?.value || "";
    const sessionId = cookieStore.get("slp_sid")?.value || "";
    if (!token || !sessionId) return false;

    const response = await fetch(plannerBackendUrl("/auth/me"), {
      cache: "no-store",
      headers: {
        authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "x-spp-session": sessionId,
        "x-spp-session-init": "1",
      },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as Record<string, unknown>;
    return Boolean(payload?.can_access_planner);
  } catch {
    return false;
  }
}

function peopleBackendUrl(path: string) {
  const base = process.env.PEOPLE_BACKEND_URL || "http://127.0.0.1:8004";
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

async function probePeopleAccess(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("slp_token")?.value || "";
    if (!token) return false;

    const response = await fetch(peopleBackendUrl("/ppl/auth/me"), {
      cache: "no-store",
      headers: {
        authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      },
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as Record<string, unknown>;
    // Any resolved access_level (view/edit/admin) means the module is reachable.
    return typeof payload?.access_level === "string" && payload.access_level.length > 0;
  } catch {
    return false;
  }
}

export default async function EmployeeConsolePage() {
  const logoSrc = "/studio-lotus-logo.png";
  const user = await fetchCurrentUser();
  if (user && !user.can_access_planner) {
    user.can_access_planner = await probePlannerAccess();
  }
  if (user && !user.can_access_people) {
    user.can_access_people = await probePeopleAccess();
  }
  const displayName =
    asString(user?.display_name) || asString(user?.full_name) || asString(user?.email) || "User";
  const initials = initialsFrom(displayName);
  const firstName = firstNameFrom(displayName);
  const role = roleFromUser(user);
  const visibleApps = apps.filter((app) => {
    if (app.href === "/recruitment/dashboard") return Boolean(user?.can_access_recruitment);
    if (app.title === "Project Planner") return Boolean(user?.can_access_planner);
    if (app.title === "People & Org") return Boolean(user?.can_access_people);
    return true;
  });

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
          <details className="employee-menu">
            <summary className="public-button public-button--ghost">Apps</summary>
            <div className="employee-menu__panel">
              <a href="/" className="employee-menu__item">Public portal</a>
              <a href="/employee" className="employee-menu__item">Workbook</a>
              {user?.can_access_recruitment ? <a href="/recruitment/dashboard" className="employee-menu__item">Recruitment</a> : null}
              {user?.can_access_planner ? <a href="/employee/planner" className="employee-menu__item">Project Planner</a> : null}
              {user?.can_access_people ? <a href="/people" className="employee-menu__item">People &amp; Org</a> : null}
            </div>
          </details>
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

      <div className="mx-auto w-full max-w-[1560px]">
        <div className="max-w-5xl">
          <h1 className="mt-10 text-4xl font-semibold text-slate-900 sm:text-5xl">
            Coordinate every workspace from one console.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-steel">
            Choose a module to continue. Each app has its own sign-in and workspace, wired to the same platform identity.
          </p>
        </div>

        <div className="mt-10 grid gap-5">
          {visibleApps.map((app) => (
            <a key={app.title} href={app.href} className="section-card workbook-card group min-h-[184px]">
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
                <span className="inline-flex items-center rounded-full border border-[#d1d1d1] bg-white px-3 py-1 text-[11px] font-semibold text-steel">
                  Open -&gt;
                </span>
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
          {visibleApps.length === 0 ? (
            <div className="section-card workbook-card min-h-[184px]">
              <div className="flex h-full flex-col justify-center">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-steel">No App Access</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">No modules are enabled for your account yet.</h2>
                <p className="mt-4 text-sm text-steel">Ask a superadmin to grant Recruitment or Project Planner access in the platform directory.</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 text-xs text-steel">
          <span className="workbook-chip">Zero-trust gateways enabled</span>
          <span>Need access? Contact your admin to enable your role in the sl_platform directory.</span>
        </div>
      </div>
    </div>
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

function GridOrbitIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 17h6m-3-3v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 19c0-2.4 1.4-4.3 3.5-4.3 1.4 0 2.5.8 3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
