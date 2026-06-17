import { authHeaderFromCookie } from "@/lib/auth-server";
import { backendUrl } from "@/lib/backend";
import { peopleBackendUrl } from "@/lib/people-backend";
import { cache } from "react";

type UserSummary = {
  display_name?: string;
  full_name?: string;
  email?: string;
  roles?: string[];
  platform_role_code?: string;
  platform_role_name?: string;
  platform_role_id?: number;
  platform_role_names?: string[];
  platform_role_codes?: string[];
  platform_role_ids?: number[];
};

type PeopleAuthSummary = {
  access_level?: string;
  is_platform_superadmin?: boolean;
};

export type PeopleUser = {
  displayName: string;
  firstName: string;
  initials: string;
  role: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normaliseRole(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const fetchCurrentUser = cache(async (): Promise<UserSummary | null> => {
  try {
    const res = await fetch(backendUrl("/auth/me"), {
      headers: await authHeaderFromCookie(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      display_name: asString(data.display_name),
      full_name: asString(data.full_name),
      email: asString(data.email),
      roles: Array.isArray(data.roles) ? (data.roles.filter((item) => typeof item === "string") as string[]) : [],
      platform_role_code: asString(data.platform_role_code),
      platform_role_name: asString(data.platform_role_name),
      platform_role_id: typeof data.platform_role_id === "number" ? data.platform_role_id : undefined,
      platform_role_names: Array.isArray(data.platform_role_names)
        ? (data.platform_role_names.filter((item) => typeof item === "string") as string[])
        : [],
      platform_role_codes: Array.isArray(data.platform_role_codes)
        ? (data.platform_role_codes.filter((item) => typeof item === "string") as string[])
        : [],
      platform_role_ids: Array.isArray(data.platform_role_ids)
        ? (data.platform_role_ids.filter((item) => typeof item === "number") as number[])
        : [],
    };
  } catch {
    return null;
  }
});

const fetchPeopleAuth = cache(async (): Promise<PeopleAuthSummary | null> => {
  try {
    const res = await fetch(peopleBackendUrl("/ppl/auth/me"), {
      headers: await authHeaderFromCookie(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      access_level: asString(data.access_level),
      is_platform_superadmin: data.is_platform_superadmin === true,
    };
  } catch {
    return null;
  }
});

export async function hasPeopleAccess() {
  const user = await fetchPeopleAuth();
  return user?.is_platform_superadmin === true || ["view", "edit", "publisher", "admin"].includes(user?.access_level || "");
}

export async function isPeopleSuperadmin() {
  const user = await fetchCurrentUser();
  if (!user) return false;

  const roleTokens = [
    user.platform_role_code,
    user.platform_role_name,
    ...(user.platform_role_codes || []),
    ...(user.platform_role_names || []),
    ...(user.roles || []),
  ].map(normaliseRole);

  return roleTokens.some((role) => ["superadmin", "super_admin", "s_admin"].includes(role)) ||
    user.platform_role_id === 2 ||
    (user.platform_role_ids || []).includes(2);
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleOf(user: UserSummary) {
  const explicit = (user.platform_role_name || "").trim();
  if (explicit) return explicit;
  const names = (user.platform_role_names || []).filter(Boolean);
  if (names.length) return names[0];
  const roles = (user.roles || []).filter(Boolean);
  if (roles.length) return roles[0];
  return "Member";
}

/** Identity for the People topbar user menu (display name, initials, role). */
export async function getPeopleUser(): Promise<PeopleUser> {
  const user = await fetchCurrentUser();
  const displayName =
    asString(user?.display_name) || asString(user?.full_name) || asString(user?.email) || "User";
  const firstName = displayName.trim().split(/\s+/)[0] || displayName;
  return {
    displayName,
    firstName,
    initials: initialsOf(displayName),
    role: user ? roleOf(user) : "Member",
  };
}
