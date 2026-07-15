/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GEMINI_API_KEYS?: string
  readonly GEMINI_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
