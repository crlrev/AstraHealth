import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import * as api from '../backend/api';
import { ApiError, login as backendLogin, logout as backendLogout } from '../backend/auth';
import { getVersion, onChange } from '../backend/bus';

type Me = ReturnType<typeof api.me>;
interface AuthState { ctx: api.Ctx; me: Me | null; login: (u: string, p: string) => Promise<void>; logout: () => void; can: (p: Me['permissions'][number]) => boolean; expire: (msg: string) => void; notice: string | null }
const AuthCtx = createContext<AuthState | null>(null);

/** Session ID + CSRF token are held in memory only (never localStorage). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<api.Ctx>({ sid: null, csrf: null });
  const [notice, setNotice] = useState<string | null>(null);
  const me = useMemo(() => { try { return ctx.sid ? api.me(ctx) : null; } catch { return null; } }, [ctx]);
  const login = useCallback(async (u: string, p: string) => { const s = await backendLogin(u, p); setNotice(null); setCtx({ sid: s.sid, csrf: s.csrf }); }, []);
  const logout = useCallback(() => { if (ctx.sid) backendLogout(ctx.sid); setCtx({ sid: null, csrf: null }); }, [ctx.sid]);
  const expire = useCallback((msg: string) => { setNotice(msg); setCtx({ sid: null, csrf: null }); }, []);
  const can = useCallback((p: Me['permissions'][number]) => !!me?.permissions.includes(p), [me]);
  return <AuthCtx.Provider value={{ ctx, me, login, logout, can, expire, notice }}>{children}</AuthCtx.Provider>;
}

export function useAuth() { const v = useContext(AuthCtx); if (!v) throw new Error('AuthProvider missing'); return v; }

/** Batched (≤1 Hz) store version — avoids re-rendering on every telemetry event. */
export function useLiveVersion() { return useSyncExternalStore(onChange, getVersion); }

export type Q<T> = { data: T; error: null } | { data: null; error: ApiError };

/** Synchronous query against the in-browser API, re-evaluated on store changes. */
export function useApi<T>(fn: (ctx: api.Ctx) => T, deps: unknown[]): Q<T> {
  const { ctx, expire } = useAuth();
  const v = useLiveVersion();
  return useMemo(() => {
    try { return { data: fn(ctx), error: null }; }
    catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, 'internal', 'Unexpected error.');
      if (err.status === 401) setTimeout(() => expire(err.message), 0);
      return { data: null, error: err };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, ctx, ...deps]);
}

/** Wraps a mutation, returning an error message instead of throwing. */
export function useMutation() {
  const { ctx, expire } = useAuth();
  return useCallback(<T,>(fn: (ctx: api.Ctx) => T): { ok: true; value: T } | { ok: false; error: ApiError } => {
    try { return { ok: true, value: fn(ctx) }; }
    catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, 'internal', 'Unexpected error.');
      if (err.status === 401) expire(err.message);
      return { ok: false, error: err };
    }
  }, [ctx, expire]);
}
