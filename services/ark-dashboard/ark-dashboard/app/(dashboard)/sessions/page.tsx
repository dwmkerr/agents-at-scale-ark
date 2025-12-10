import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { SessionsSection } from '@/components/sections/sessions-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

type SearchParams = {
  active?: string;
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function SessionsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Sessions" />
      <div className="flex flex-1 flex-col">
        <SessionsSection active={params.active === 'true'} />
      </div>
    </>
  );
}
