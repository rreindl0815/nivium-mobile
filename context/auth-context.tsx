import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { AuthUser, MagicLinkRequestResult, UpdatesSignupResult } from '@/types/auth';
import {
  exchangeMagicLinkAsync,
  fetchSessionAsync,
  isAuthServiceConfigured,
  requestMagicLinkAsync,
  submitUpdatesSignupAsync,
} from '@/utils/auth-client';

type AuthContextValue = {
  authConfigured: boolean;
  isAuthenticated: boolean;
  isBusy: boolean;
  isLoaded: boolean;
  sessionToken: string | null;
  user: AuthUser | null;
  requestMagicLink: (input: {
    email: string;
    displayName?: string;
    updatesOptIn?: boolean;
    next?: string;
  }) => Promise<MagicLinkRequestResult>;
  completeMagicLinkSignIn: (token: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  submitUpdatesSignup: (input: {
    email: string;
    displayName?: string;
    source?: string;
  }) => Promise<UpdatesSignupResult>;
};

const STORAGE_KEY = 'nivium-auth-session-v1';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const authConfigured = isAuthServiceConfigured();

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      if (!authConfigured) {
        if (isMounted) {
          setIsLoaded(true);
        }
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) {
          if (isMounted) {
            setSessionToken(null);
            setUser(null);
          }
          return;
        }

        const payload = JSON.parse(stored) as { sessionToken?: string } | null;
        const nextToken = payload?.sessionToken?.trim() ?? '';
        if (!nextToken) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          if (isMounted) {
            setSessionToken(null);
            setUser(null);
          }
          return;
        }

        const session = await fetchSessionAsync(nextToken);
        if (isMounted) {
          setSessionToken(nextToken);
          setUser(session.user);
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        if (isMounted) {
          setSessionToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, [authConfigured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authConfigured,
      isAuthenticated: Boolean(user),
      isBusy,
      isLoaded,
      sessionToken,
      user,
      requestMagicLink: async (input) => {
        setIsBusy(true);
        try {
          return await requestMagicLinkAsync(input);
        } finally {
          setIsBusy(false);
        }
      },
      completeMagicLinkSignIn: async (token) => {
        setIsBusy(true);
        try {
          const session = await exchangeMagicLinkAsync(token);
          setSessionToken(session.sessionToken);
          setUser(session.user);
          await AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              sessionToken: session.sessionToken,
            })
          );
          return session.user;
        } finally {
          setIsBusy(false);
        }
      },
      signOut: async () => {
        setIsBusy(true);
        try {
          setSessionToken(null);
          setUser(null);
          await AsyncStorage.removeItem(STORAGE_KEY);
        } finally {
          setIsBusy(false);
        }
      },
      submitUpdatesSignup: async (input) => {
        setIsBusy(true);
        try {
          return await submitUpdatesSignupAsync(input);
        } finally {
          setIsBusy(false);
        }
      },
    }),
    [authConfigured, isBusy, isLoaded, sessionToken, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
