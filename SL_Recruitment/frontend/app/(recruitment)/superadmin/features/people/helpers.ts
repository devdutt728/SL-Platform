import type { PlatformPerson } from "@/lib/types";
import type { PersonForm } from "./types";

type StatusBadge = { label: string; className: string };

export function toInputDate(value?: string | null) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
}

export function toInputDateTime(value?: string | null) {
  if (!value) return "";
  if (value.includes("T")) return value.slice(0, 16);
  return value;
}

export function fromInputDate(value: string) {
  return value.trim() ? value.trim() : null;
}

export function fromInputDateTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
}

export function toPersonForm(person: PlatformPerson): PersonForm {
  return {
    person_id: person.person_id || "",
    person_code: person.person_code || "",
    personal_id: person.personal_id || "",
    first_name: person.first_name || "",
    last_name: person.last_name || "",
    email: person.email || "",
    mobile_number: person.mobile_number || "",
    role_id: person.role_id != null ? String(person.role_id) : "",
    grade_id: person.grade_id != null ? String(person.grade_id) : "",
    department_id: person.department_id != null ? String(person.department_id) : "",
    manager_id: person.manager_id || "",
    employment_type: person.employment_type || "",
    join_date: toInputDate(person.join_date),
    exit_date: toInputDate(person.exit_date),
    status: person.status || "",
    is_deleted: person.is_deleted != null ? String(person.is_deleted) : "",
    created_at: toInputDateTime(person.created_at),
    updated_at: toInputDateTime(person.updated_at),
    source_system: person.source_system || "",
    full_name: person.full_name || "",
    display_name: person.display_name || "",
  };
}

export function getStatusBadge(status?: string | null, isDeleted?: number | null): StatusBadge | null {
  if (isDeleted) {
    return { label: "Deleted", className: "border-rose-200 bg-rose-100 text-rose-700" };
  }
  const normalized = (status || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["working", "active"].includes(normalized)) {
    return { label: "Working", className: "border-emerald-200 bg-emerald-100 text-emerald-700" };
  }
  if (["relieved", "inactive", "exited"].includes(normalized)) {
    return { label: "Relieved", className: "border-amber-200 bg-amber-100 text-amber-700" };
  }
  return { label: normalized.replace(/_/g, " "), className: "border-slate-200 bg-slate-100 text-slate-600" };
}

export function stripPersonId(payload: Record<string, unknown>) {
  const copy = { ...payload };
  delete copy.person_id;
  return copy;
}
