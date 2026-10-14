import { createCloud, type Cloud, type CloudConfig } from './service';

/**
 * The Firebase project this build talks to. The values come from build-time
 * variables (see the README); they identify the project and are not secret.
 * Access to data is decided by the Firestore rules, not by these values.
 */
function configFromBuild(): CloudConfig | null {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_EMULATOR === 'true') {
    return {
      apiKey: 'demo-key',
      authDomain: 'localhost',
      projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-shatu',
      appId: 'demo-app',
      emulator: { authUrl: 'http://127.0.0.1:9292', firestoreHost: '127.0.0.1', firestorePort: 8282 },
    };
  }
  const { VITE_FIREBASE_API_KEY: apiKey, VITE_FIREBASE_AUTH_DOMAIN: authDomain, VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_APP_ID: appId } = env;
  return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;
}

const config = configFromBuild();

/** Null when this copy was built without a Firebase project. */
export const cloud: Cloud | null = config ? createCloud(config) : null;
