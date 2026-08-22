import { EmptyState, PageHeader } from '@/components/ui';

export default function NewsPage() {
  return (
    <>
      <PageHeader title="News" lead="Wowhead retail and in-development feeds." />
      <EmptyState
        title="No news yet"
        body="The news sync lands in Step 8."
        command="npm run sync:news"
      />
    </>
  );
}
