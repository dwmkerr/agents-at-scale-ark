import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { FilesSection } from '@/components/sections/files-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function FilesPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Files" />
      <div className="flex flex-1 flex-col">
        <FilesSection />
      </div>
    </>
  );
}
