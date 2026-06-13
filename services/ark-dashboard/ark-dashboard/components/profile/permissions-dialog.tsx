'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useArkContext } from '@/providers/ContextProvider';

type PermissionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PermissionsDialog({
  open,
  onOpenChange,
}: PermissionsDialogProps) {
  const { context } = useArkContext();
  const namespace = context?.namespace;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My Permissions</DialogTitle>
          <DialogDescription>
            What you can do with Ark resources
            {namespace ? (
              <>
                {' '}
                in namespace <span className="font-medium">{namespace}</span>
              </>
            ) : null}
            .
          </DialogDescription>
        </DialogHeader>
        <PermissionsTable />
      </DialogContent>
    </Dialog>
  );
}

function PermissionsTable() {
  const { context, permissions } = useArkContext();
  const namespace = context?.namespace;

  if (!permissions) {
    return (
      <p className="text-muted-foreground text-sm">
        Permission information is not available.
      </p>
    );
  }

  if (permissions.status === 'unavailable') {
    return (
      <p className="text-muted-foreground text-sm">
        Couldn&apos;t evaluate your permissions
        {namespace ? <> for namespace {namespace}</> : null}.
        {permissions.reason ? <> ({permissions.reason})</> : null}
      </p>
    );
  }

  const rules = permissions.rules ?? {};
  const resources = Object.keys(rules).sort();

  if (resources.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You have no access to Ark resources in this namespace.
      </p>
    );
  }

  return (
    <table className="w-full max-w-xl text-left text-sm">
      <thead>
        <tr className="text-muted-foreground border-b">
          <th className="py-2 font-medium">Resource</th>
          <th className="py-2 font-medium">Verbs</th>
        </tr>
      </thead>
      <tbody>
        {resources.map(resource => (
          <tr key={resource} className="border-b last:border-0">
            <td className="py-2 font-mono">
              {resource === '*' ? 'all resources' : resource}
            </td>
            <td className="py-2 font-mono">
              {(rules[resource] ?? [])
                .map(verb => (verb === '*' ? 'all' : verb))
                .join(', ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
