import { MatchRoom } from "./MatchRoom";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tier?: string }>;
}) {
  const { id } = await params;
  const { tier } = await searchParams;
  // Rooms are PAID ONLY — an unknown or legacy `free` tier falls back to the
  // lowest paid buy-in; there is no free entry.
  return <MatchRoom fixtureId={Number(id)} tier={tier ?? "low"} />;
}
