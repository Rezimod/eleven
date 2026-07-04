import { MatchRoom } from "./MatchRoom";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchRoom fixtureId={Number(id)} />;
}
