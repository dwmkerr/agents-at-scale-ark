import {
  Cloud,
  Github,
  type LucideIcon,
  Package,
  ShoppingBag,
  Store,
} from 'lucide-react';

import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';

export type OriginType =
  | 'github'
  | 'helm'
  | 'marketplace'
  | 'aws'
  | 'google'
  | 'salesforce';

export interface Origin {
  uri: string;
  type: OriginType;
}

export interface ParsedOrigin extends Origin {
  label: string;
  isLocked: boolean;
  icon: LucideIcon;
}

const ORIGIN_CONFIG: Record<OriginType, { label: string; icon: LucideIcon }> = {
  github: { label: 'GitHub', icon: Github },
  helm: { label: 'Helm', icon: Package },
  marketplace: { label: 'Marketplace', icon: Store },
  aws: { label: 'AWS', icon: Cloud },
  google: { label: 'Google Cloud', icon: Cloud },
  salesforce: { label: 'Salesforce', icon: ShoppingBag },
};

export function parseOrigin(
  annotations: Record<string, string> | null | undefined,
): ParsedOrigin | null {
  if (!annotations) return null;

  const originJson = annotations[ARK_ANNOTATIONS.ORIGIN];
  if (!originJson) return null;

  try {
    const origin = JSON.parse(originJson) as Origin;
    if (!origin.uri || !origin.type) return null;

    const config = ORIGIN_CONFIG[origin.type] || {
      label: origin.type,
      icon: Cloud,
    };

    return {
      ...origin,
      label: config.label,
      icon: config.icon,
      isLocked: true,
    };
  } catch {
    return null;
  }
}

export function hasOrigin(
  annotations: Record<string, string> | null | undefined,
): boolean {
  return parseOrigin(annotations) !== null;
}
