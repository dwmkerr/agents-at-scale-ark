'use client';

import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/common/page-header';
import { PermissionsTable } from '@/components/profile/permissions-table';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';

export default function AccountPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';

  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Account" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h2 className="mb-1 text-sm font-semibold">My Permissions</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            What you can do with Ark resources in namespace &apos;{namespace}
            &apos;.
          </p>
          <PermissionsTable />
        </div>
      </div>
    </>
  );
}
