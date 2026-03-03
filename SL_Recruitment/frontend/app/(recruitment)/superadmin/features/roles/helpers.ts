import type { PlatformPersonSuggestion } from "@/lib/types";

export function formatPersonRoles(person: PlatformPersonSuggestion | null): string {
  if (!person) return "";
  const names = (person.role_names || []).filter(Boolean);
  const codes = (person.role_codes || []).filter(Boolean);
  if (names.length) return names.join(", ");
  if (codes.length) return codes.join(", ");
  if (person.role_name) return person.role_name;
  if (person.role_code) return person.role_code;
  return "";
}
