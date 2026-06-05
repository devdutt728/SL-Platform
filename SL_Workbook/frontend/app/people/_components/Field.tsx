"use client";

export type FieldType = "text" | "date" | "select" | "bool";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  readOnly?: boolean;
}

interface FieldProps {
  def: FieldDef;
  value: string | boolean | null | undefined;
  editable: boolean;
  onChange: (key: string, value: string | boolean | null) => void;
}

export function Field({ def, value, editable, onChange }: FieldProps) {
  const type = def.type || "text";
  const ro = def.readOnly || !editable;
  const selectOptions = def.options || [];
  const currentSelectValue = typeof value === "string" ? value : "";
  const visibleSelectOptions =
    type === "select" && currentSelectValue && !selectOptions.includes(currentSelectValue)
      ? [currentSelectValue, ...selectOptions]
      : selectOptions;

  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{def.label}</span>
      <div className="mt-1">
        {ro ? (
          <p className="min-h-[1.5rem] text-sm text-slate-800">{displayValue(type, value)}</p>
        ) : type === "bool" ? (
          <select
            value={value === true ? "true" : value === false ? "false" : ""}
            onChange={(e) => onChange(def.key, e.target.value === "" ? null : e.target.value === "true")}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
          >
            <option value="">—</option>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        ) : type === "select" ? (
          <select
            value={currentSelectValue}
            onChange={(e) => onChange(def.key, e.target.value || null)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
          >
            <option value="">—</option>
            {visibleSelectOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type={type === "date" ? "date" : "text"}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(def.key, e.target.value || null)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
          />
        )}
      </div>
    </label>
  );
}

function displayValue(type: FieldType, value: string | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "bool") return value ? "Yes" : "No";
  if (type === "date") {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
}
