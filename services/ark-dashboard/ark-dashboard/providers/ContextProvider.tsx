'use client';

import { useSearchParams } from 'next/navigation';
import type { PropsWithChildren, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import { AccessDenied } from '@/components/access/access-denied';
import { ClusterUnavailable } from '@/components/access/cluster-unavailable';
import { hasEssentialAccess, missingEssential } from '@/lib/permissions';
import type { ContextResponse, Permissions } from '@/lib/services/namespaces';
import { useGetContext } from '@/lib/services/namespaces-hooks';
import { useUser } from '@/providers/UserProvider';

interface ContextValue {
  context?: ContextResponse;
  permissions?: Permissions | null;
  isPending: boolean;
  error: unknown;
}

const Context = createContext<ContextValue | undefined>(undefined);

function ContextProvider({ children }: PropsWithChildren) {
  const searchParams = useSearchParams();
  const namespaceFromQueryParams = searchParams.get('namespace');
  const { user } = useUser();

  const { data, isPending, error } = useGetContext(
    namespaceFromQueryParams || undefined,
  );

  const permissions = data?.permissions;

  const value = useMemo<ContextValue>(
    () => ({ context: data, permissions, isPending, error }),
    [data, permissions, isPending, error],
  );

  let gate: ReactNode = null;
  if (permissions?.status === 'unavailable') {
    gate = (
      <ClusterUnavailable
        namespace={data?.namespace}
        reason={permissions.reason}
      />
    );
  } else if (permissions?.status === 'ok' && !hasEssentialAccess(permissions)) {
    gate = (
      <AccessDenied
        namespace={data?.namespace}
        email={user?.email}
        missing={missingEssential(permissions)}
      />
    );
  }

  return (
    <Context.Provider value={value}>{gate ?? children}</Context.Provider>
  );
}

function useArkContext() {
  const context = useContext(Context);
  if (!context) {
    throw new Error('useArkContext must be used within a ContextProvider');
  }

  return context;
}

export { ContextProvider, useArkContext };
