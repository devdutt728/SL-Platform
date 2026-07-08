export { useDebounced, usePersistentColumns } from "./hooks";
export {
  FilterBar,
  FilterSelect,
  SearchInput,
  SegmentedControl,
  MultiSelectFilter,
  ResetFiltersButton,
  type SegmentOption,
} from "./Filters";
export { DataTable, GroupedTable, ColumnToggle, exportTableCsv, exportRowsCsv } from "./DataTable";
export { groupBy, CollapsibleGroup, GroupMetaStat } from "./Grouped";
export { StatBand, type StatItem, type StatTone } from "./StatBand";
export { SavedViewsMenu, useSavedViews, type SavedView } from "./SavedViews";

/** Segmented options for the Table ⟷ Grouped-by-team view toggle used per tab. */
export const VIEW_OPTIONS = [
  { value: "table", label: "Table" },
  { value: "grouped", label: "By team" },
] as const;
