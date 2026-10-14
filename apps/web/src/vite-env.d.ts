/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
