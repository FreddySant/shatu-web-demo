/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** "true" to use the local Firebase emulators. */
  readonly VITE_FIREBASE_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
