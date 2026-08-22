import { CharacterLookup } from '@/components/CharacterLookup';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function CharacterPage() {
  return (
    <>
      <PageHeader
        title="Character Lookup"
        lead="Raider.IO profile — equipped gear, Mythic+ score and raid progression. Cached for 15 minutes."
      />
      <CharacterLookup />
    </>
  );
}
