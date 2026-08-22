import { EmptyState, PageHeader } from '@/components/ui';

export default function CharacterPage() {
  return (
    <>
      <PageHeader
        title="Character Lookup"
        lead="Raider.IO profile \u2014 equipped gear, Mythic+ score and raid progression."
      />
      <EmptyState
        title="Not built yet"
        body="The lookup form and profile view land in Step 9, along with the 15-minute cache."
        command="see planning/07-steps.md"
      />
    </>
  );
}
