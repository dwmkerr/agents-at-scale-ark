import axios, {AxiosInstance} from 'axios';

import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CONNECTION_TEST_TIMEOUT_MS,
} from './consts.js';

export interface ArkService {
  name: string;
  namespace: string;
  release_name: string;
  chart_name: string;
  chart_version: string;
  description?: string;
  routes?: HTTPRouteInfo[];
  httproutes?: HTTPRouteInfo[];
}

export interface HTTPRouteInfo {
  name: string;
  namespace: string;
  url: string;
  rules: number;
}

export interface ArkServiceListResponse {
  items: ArkService[];
}

export class ArkClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  getBaseURL(): string {
    return this.client.defaults.baseURL || '';
  }

  /**
   * Get ARK services and their discovered URLs from gateway routes
   */
  async getArkServices(namespace: string = 'default'): Promise<ArkService[]> {
    try {
      const response = await this.client.get<ArkServiceListResponse>(
        `/v1/namespaces/${namespace}/ark-services`
      );
      return response.data.items;
    } catch (_error) {
      // If service discovery fails, return empty array to fall back to defaults
      return [];
    }
  }

  /**
   * Test if the API is reachable
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/health', {
        timeout: DEFAULT_CONNECTION_TEST_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }
}
