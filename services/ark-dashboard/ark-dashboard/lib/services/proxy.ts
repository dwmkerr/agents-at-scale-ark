import { APIClient, apiClient } from '@/lib/api/client';

const proxyApiClient = new APIClient('/api/v1/proxy/services');

export interface ServiceListResponse {
  services: string[];
}

export type BrokerStatus = 'available' | 'not-installed' | 'not-running';

// proxyApiClient is a separate APIClient instance, so it doesn't carry the
// namespace default param NamespaceProvider sets on the shared apiClient. Without
// it these calls default server-side to the pod namespace (ark-system) where
// tenant users have no RBAC -> 403. Forward the current namespace explicitly.
function namespaceParams(): Record<string, string> {
  const namespace = apiClient.getDefaultParam('namespace');
  return namespace ? { namespace } : {};
}

export const proxyService = {
  async listServices(): Promise<ServiceListResponse> {
    return proxyApiClient.get<ServiceListResponse>('', {
      params: namespaceParams(),
    });
  },

  async isServiceAvailable(serviceName: string): Promise<boolean> {
    const response = await this.listServices();
    return response.services.includes(serviceName);
  },

  async checkBrokerHealth(): Promise<BrokerStatus> {
    const installed = await this.isServiceAvailable('ark-broker');
    if (!installed) {
      return 'not-installed';
    }
    try {
      const namespace = apiClient.getDefaultParam('namespace');
      const healthUrl =
        '/api/v1/proxy/services/ark-broker/health' +
        (namespace ? `?namespace=${encodeURIComponent(namespace)}` : '');
      const res = await fetch(healthUrl);
      if (res.ok) {
        return 'available';
      }
      return 'not-running';
    } catch {
      return 'not-running';
    }
  },
};
