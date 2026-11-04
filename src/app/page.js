import { redirect } from "next/navigation";

export default async function HomePage({ searchParams }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp || {}).toString();
  redirect(qs ? `/menu?${qs}` : "/menu");
}
