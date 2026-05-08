import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import type { SavedProfile, VoiceNoteSession } from '@/types/profile';
import { formatDraftToEngineText } from '@/utils/formatter';
import { hydrateStructuredValuesFromFormattedText } from '@/utils/structured-profile-values';

const STORAGE_KEY = 'nivium-voice-note-session-v1';

type VoiceNoteSessionContextValue = {
  session: VoiceNoteSession;
  isLoaded: boolean;
  setFromFormatterResult: (input: {
    transcriptRaw?: string;
    engineText?: string;
    resolvedValues?: Record<string, string>;
    warnings?: string[];
    formatterVersion?: string;
    audioUri?: string;
  }) => void;
  setReviewFieldValue: (fieldId: string, value: string) => void;
  replaceReviewValues: (values: Record<string, string>) => void;
  loadFromSavedProfile: (profile: SavedProfile) => void;
  clearSession: () => Promise<void>;
};

const createDefaultSession = (): VoiceNoteSession => ({
  profileId: undefined,
  transcriptRaw: '',
  engineTextOriginal: '',
  engineTextCurrent: '',
  reviewValues: {},
  serviceWarnings: [],
  warnings: [],
  updatedAt: new Date().toISOString(),
});

const VoiceNoteSessionContext = createContext<VoiceNoteSessionContextValue | null>(null);

export function VoiceNoteSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<VoiceNoteSession>(createDefaultSession);
  const [isLoaded, setIsLoaded] = useState(false);
  const sessionRef = useRef<VoiceNoteSession>(createDefaultSession());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && isMounted) {
          const parsed = JSON.parse(stored) as Partial<VoiceNoteSession>;
          const loadedSession: VoiceNoteSession = {
            ...createDefaultSession(),
            ...parsed,
            reviewValues:
              parsed.reviewValues && typeof parsed.reviewValues === 'object' ? parsed.reviewValues : {},
            serviceWarnings: Array.isArray(parsed.serviceWarnings)
              ? parsed.serviceWarnings
              : Array.isArray(parsed.warnings)
                ? parsed.warnings
                : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          };
          const fallbackReviewValues = hydrateStructuredValuesFromFormattedText(
            loadedSession.engineTextCurrent?.trim() || loadedSession.engineTextOriginal?.trim() || '',
            {}
          );
          const nextSession =
            Object.keys(loadedSession.reviewValues).length > 0
              ? buildSessionFromReviewValues(loadedSession, loadedSession.reviewValues)
              : (loadedSession.engineTextCurrent?.trim() || loadedSession.engineTextOriginal?.trim())
                ? buildSessionFromReviewValues(
                    {
                      ...loadedSession,
                      reviewValues: fallbackReviewValues,
                    },
                    fallbackReviewValues
                  )
                : loadedSession;
          setSession(nextSession);
        }
      } catch {
        if (isMounted) {
          setSession(createDefaultSession());
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
  }, []);

  const persistSession = async (nextSession: VoiceNoteSession) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
  };

  const buildSessionFromReviewValues = (
    baseSession: VoiceNoteSession,
    reviewValues: Record<string, string>
  ): VoiceNoteSession => {
    const result = formatDraftToEngineText({
      rawNotes: baseSession.transcriptRaw,
      values: reviewValues,
      updatedAt: new Date().toISOString(),
    });
    const combinedWarnings = Array.from(new Set([...(baseSession.serviceWarnings ?? []), ...(result.warnings ?? [])]));

    return {
      ...baseSession,
      reviewValues,
      engineTextCurrent: result.formattedText,
      warnings: combinedWarnings,
      updatedAt: new Date().toISOString(),
    };
  };

  const setFromFormatterResult = (input: {
    transcriptRaw?: string;
    engineText?: string;
    resolvedValues?: Record<string, string>;
    warnings?: string[];
    formatterVersion?: string;
    audioUri?: string;
  }) => {
    const transcriptRaw = input.transcriptRaw?.trim() ?? '';
    const engineText = input.engineText?.trim() ?? '';
    const serviceWarnings = [...(input.warnings ?? [])];

    if (!engineText && transcriptRaw) {
      serviceWarnings.push('Formatter returned transcript text only. Review carefully before render.');
    }

    const reviewValues = hydrateStructuredValuesFromFormattedText(engineText || transcriptRaw, input.resolvedValues ?? {});
    const seededSession = buildSessionFromReviewValues(
      {
        profileId: undefined,
        transcriptRaw,
        engineTextOriginal: engineText || transcriptRaw,
        engineTextCurrent: engineText || transcriptRaw,
        reviewValues,
        serviceWarnings,
        warnings: serviceWarnings,
        formatterVersion: input.formatterVersion,
        audioUri: input.audioUri,
        updatedAt: new Date().toISOString(),
      },
      reviewValues
    );

    void persistSession(seededSession);
  };

  const setReviewFieldValue = (fieldId: string, value: string) => {
    const nextValues = {
      ...sessionRef.current.reviewValues,
      [fieldId]: value,
    };
    const nextSession = buildSessionFromReviewValues(sessionRef.current, nextValues);
    void persistSession(nextSession);
  };

  const replaceReviewValues = (values: Record<string, string>) => {
    const nextSession = buildSessionFromReviewValues(sessionRef.current, values);
    void persistSession(nextSession);
  };

  const loadFromSavedProfile = (profile: SavedProfile) => {
    const reviewValues = hydrateStructuredValuesFromFormattedText(profile.formattedText ?? '', profile.sourceValues ?? {});
    const nextSession = buildSessionFromReviewValues(
      {
        profileId: profile.id,
        transcriptRaw: profile.transcriptRaw ?? profile.rawNotes ?? '',
        engineTextOriginal: profile.engineTextOriginal ?? profile.formattedText ?? '',
        engineTextCurrent: profile.formattedText ?? '',
        reviewValues,
        serviceWarnings: profile.formatterWarnings ?? [],
        warnings: profile.formatterWarnings ?? [],
        audioUri: profile.audioUri,
        updatedAt: new Date().toISOString(),
      },
      reviewValues
    );
    void persistSession(nextSession);
  };

  const clearSession = async () => {
    const nextSession = createDefaultSession();
    sessionRef.current = nextSession;
    setSession(nextSession);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <VoiceNoteSessionContext.Provider
      value={{
        session,
        isLoaded,
        setFromFormatterResult,
        setReviewFieldValue,
        replaceReviewValues,
        loadFromSavedProfile,
        clearSession,
      }}>
      {children}
    </VoiceNoteSessionContext.Provider>
  );
}

export function useVoiceNoteSession() {
  const context = useContext(VoiceNoteSessionContext);

  if (!context) {
    throw new Error('useVoiceNoteSession must be used inside VoiceNoteSessionProvider');
  }

  return context;
}
