import {execa} from 'execa';

/**
 * Check if ARK is ready by verifying the ark-controller is running
 * @returns true if ark-controller deployment exists and has ready replicas
 */
export async function isArkReady(): Promise<boolean> {
  try {
    // Check if ark-controller deployment exists and get its status
    const result = await execa(
      'kubectl',
      ['get', 'deployment', 'ark-controller', '-n', 'ark-system', '-o', 'json'],
      {stdio: 'pipe'}
    );

    const deployment = JSON.parse(result.stdout);
    const readyReplicas = deployment.status?.readyReplicas || 0;
    const replicas = deployment.spec?.replicas || 0;

    // ARK is ready if deployment exists and has at least one ready replica
    return readyReplicas > 0 && readyReplicas === replicas;
  } catch {
    // Deployment doesn't exist or kubectl failed
    return false;
  }
}