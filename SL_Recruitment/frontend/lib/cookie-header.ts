import { cookies } from "next/headers";

export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  const all = store.getAll();
  if (!all.length) return "";
  return all.map((item) => `${item.name}=${item.value}`).join("; ");
}
