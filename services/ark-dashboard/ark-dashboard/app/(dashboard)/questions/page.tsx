'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { QuestionsSection } from '@/components/sections/questions-section';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function QuestionsPage() {
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Questions" />
      <div className="flex flex-1 flex-col">
        <QuestionsSection />
      </div>
    </>
  );
}
