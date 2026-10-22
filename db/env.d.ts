declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DEMO_LOGIN_ENABLED?: string | boolean;
    PROCESS_SESSION_SECRET?: string;
    PROCESS_RELEASE_TOKEN?: string;
    PROCESS_RELEASE_DISABLED?: string;
    PROCESS_SESSION_REVOCATION_ENABLED?: string;
    PROCESS_PROGRAM_COMMIT?: string;
    PROCESS_IQC_IMPORT_SOURCE_KEY?: string;
    PROCESS_IQC_IMPORT_SOURCE_SHA256?: string;
  }
}
