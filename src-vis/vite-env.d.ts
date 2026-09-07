/// <reference types="vite/client" />

/** Dev-only switches, set in `.env.local` (git-ignored via `*.local`). */
interface ImportMetaEnv {
    /** Namespace the dev preview works against, e.g. "aura.1". Empty = the production instance. */
    readonly VITE_AURA_NAMESPACE?: string;
    /** "1" disables the dev write guard, so a real device can be switched on purpose. */
    readonly VITE_AURA_ALLOW_WRITES?: string;
}
