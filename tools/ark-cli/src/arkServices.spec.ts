import {
  arkDependencies,
  arkServices,
  getInstallableServices,
  getStatusCheckableServices,
  getHealthPath,
} from './arkServices.js';

describe('arkServices', () => {
  it('exports arkDependencies with expected structure', () => {
    expect(arkDependencies).toBeDefined();
    expect(arkDependencies['cert-manager']).toBeDefined();
    expect(arkDependencies['cert-manager'].command).toBe('helm');
  });

  it('exports arkServices with expected structure', () => {
    expect(arkServices).toBeDefined();
    expect(arkServices['ark-controller']).toBeDefined();
    expect(arkServices['ark-api'].namespace).toBe('default');
  });

  it('getInstallableServices returns services with chartPath', () => {
    const installable = getInstallableServices();

    expect(installable['ark-controller']).toBeDefined();
    expect(installable['ark-api']).toBeDefined();
    expect(installable['ark-api-a2a']).toBeUndefined(); // no chartPath
  });

  it('getStatusCheckableServices returns services with gatewayUrl', () => {
    const statusCheckable = getStatusCheckableServices();

    expect(statusCheckable['ark-api']).toContain('ark-api.127.0.0.1.nip.io');
    expect(statusCheckable['ark-controller']).toBeUndefined(); // no gatewayUrl
  });

  it('getHealthPath returns health path for services', () => {
    expect(getHealthPath('ark-api')).toBe('/health');
    expect(getHealthPath('ark-dashboard')).toBe('');
    expect(getHealthPath('nonexistent')).toBe('');
  });
});