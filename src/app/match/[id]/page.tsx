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
  return <MatchRoom fixtureId={Number(id)} tier={tier ?? "free"} />;
}
