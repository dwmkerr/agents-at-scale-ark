import {
  arkDependencies,
  arkServices,
  getInstallableServices,
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
});