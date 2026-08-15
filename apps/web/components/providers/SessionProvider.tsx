'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface SessionUser {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Session {
  user?: SessionUser;
  expires?: string;
}

/** next-auth 兼容的 Session 上下文类型（同时支持 session 和 data 属性） */
export interface SessionContextValue {
  session: Session | null;
  data: Session | null;
  status: string;
  /** next-auth 兼容：本地更新 session（如资料保存后刷新用户信息） */
  update: (data?: Session | null) => Promise<Session | null>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  data: null,
  status: 'loading',
  update: async () => null,
});

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<string>('loading');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data?.user) {
          setSession(data);
          setStatus('authenticated');
        } else {
          setSession(null);
          setStatus('unauthenticated');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
          setStatus('unauthenticated');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        data: session,
        status,
        update: async (data) => {
          const next = { ...(session ?? {}), ...(data ?? {}) } as Session;
          setSession(next);
          setStatus('authenticated');
          return next;
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

/**
 * useSession hook — 接口兼容 next-auth/react 的 useSession
 * 返回 { session, status } 其中 status 为 'loading' | 'authenticated' | 'unauthenticated'
 */
export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
