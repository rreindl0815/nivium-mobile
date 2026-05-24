import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { useProfileDefaults } from '@/context/profile-defaults-context';
import type { SavedProfile, VoiceNoteSession } from '@/types/profile';
import { buildDefaultProfileValues, type ProfileDefaults } from '@/utils/profile-defaults';
import { formatDraftToEngineText } from '@/utils/formatter';
import { parseFormattedProfile } from '@/utils/profile-document';
import { hydrateStructuredValuesFromFormattedText } from '@/utils/structured-profile-values';

const STORAGE_KEY = 'nivium-voice-note-session-v1';
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type VoiceNoteSessionContextValue = {
  session: VoiceNoteSession;
  isLoaded: boolean;
  setFromFormatterResult: (input: {
    profileId?: string;
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

const createDefaultSession = (defaults: ProfileDefaults): VoiceNoteSession => {
  const now = new Date();
  return {
    profileId: undefined,
    transcriptRaw: '',
    engineTextOriginal: '',
    engineTextCurrent: '',
    reviewValues: buildSeededReviewValues({}, defaults, now),
    serviceWarnings: [],
    warnings: [],
    updatedAt: now.toISOString(),
  };
};

const VoiceNoteSessionContext = createContext<VoiceNoteSessionContextValue | null>(null);

export function VoiceNoteSessionProvider({ children }: { children: React.ReactNode }) {
  const { defaults, isLoaded: areDefaultsLoaded } = useProfileDefaults();
  const [session, setSession] = useState<VoiceNoteSession>(() => createDefaultSession(defaults));
  const [isLoaded, setIsLoaded] = useState(false);
  const hasInitializedRef = useRef(false);
  const sessionRef = useRef<VoiceNoteSession>(createDefaultSession(defaults));

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!areDefaultsLoaded || hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    let isMounted = true;

    async function loadSession() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && isMounted) {
          const parsed = JSON.parse(stored) as Partial<VoiceNoteSession>;
          const shouldSeedMetadata = shouldSeedVoiceNoteMetadata(parsed);
          const loadedSession: VoiceNoteSession = {
            ...createDefaultSession(defaults),
            ...parsed,
            reviewValues:
              parsed.reviewValues && typeof parsed.reviewValues === 'object'
                ? shouldSeedMetadata
                  ? buildSeededReviewValues(parsed.reviewValues, defaults)
                  : parsed.reviewValues
                : shouldSeedMetadata
                  ? buildSeededReviewValues({}, defaults)
                  : {},
            serviceWarnings: Array.isArray(parsed.serviceWarnings)
              ? parsed.serviceWarnings
              : Array.isArray(parsed.warnings)
                ? parsed.warnings
                : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
          };
          const trustedEngineText = resolvePreferredVoiceNoteEngineText(
            loadedSession.engineTextCurrent?.trim() ?? '',
            loadedSession.engineTextOriginal?.trim() ?? ''
          );
          const seededReviewValues = hydrateStructuredValuesFromFormattedText(
            trustedEngineText,
            loadedSession.reviewValues ?? {}
          );
          const nextSession = trustedEngineText
            ? {
                ...loadedSession,
                engineTextCurrent: trustedEngineText,
                engineTextOriginal: loadedSession.engineTextOriginal?.trim() || trustedEngineText,
                reviewValues: seededReviewValues,
              }
            : Object.keys(loadedSession.reviewValues).length > 0
              ? buildSessionFromReviewValues(loadedSession, loadedSession.reviewValues)
              : loadedSession;
          setSession(nextSession);
        }
      } catch {
        if (isMounted) {
          setSession(createDefaultSession(defaults));
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
  }, [areDefaultsLoaded, defaults]);

  useEffect(() => {
    if (!areDefaultsLoaded || !isLoaded) {
      return;
    }

    const currentSession = sessionRef.current;
    if (!shouldSeedVoiceNoteMetadata(currentSession)) {
      return;
    }

    const nextReviewValues = buildRefreshedVoiceNoteSeedValues(currentSession.reviewValues, defaults);
    if (haveSameReviewValues(currentSession.reviewValues, nextReviewValues)) {
      return;
    }

    void persistSession({
      ...currentSession,
      reviewValues: nextReviewValues,
      updatedAt: new Date().toISOString(),
    });
  }, [areDefaultsLoaded, defaults, isLoaded]);

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
    profileId?: string;
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

    const trustedEngineText = engineText || transcriptRaw;
    const reviewValues = hydrateStructuredValuesFromFormattedText(trustedEngineText, input.resolvedValues ?? {});
    const seededSession: VoiceNoteSession = {
      profileId: input.profileId,
      transcriptRaw,
      engineTextOriginal: trustedEngineText,
      engineTextCurrent: trustedEngineText,
      reviewValues,
      serviceWarnings,
      warnings: serviceWarnings,
      formatterVersion: input.formatterVersion,
      audioUri: input.audioUri,
      updatedAt: new Date().toISOString(),
    };

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
    const trustedEngineText = resolvePreferredVoiceNoteEngineText(
      profile.formattedText ?? '',
      profile.engineTextOriginal ?? profile.formattedText ?? ''
    );
    const reviewValues = hydrateStructuredValuesFromFormattedText(trustedEngineText, profile.sourceValues ?? {});
    const nextSession: VoiceNoteSession = {
      profileId: profile.id,
      transcriptRaw: profile.transcriptRaw ?? profile.rawNotes ?? '',
      engineTextOriginal: profile.engineTextOriginal ?? trustedEngineText,
      engineTextCurrent: trustedEngineText,
      reviewValues,
      serviceWarnings: profile.formatterWarnings ?? [],
      warnings: profile.formatterWarnings ?? [],
      audioUri: profile.audioUri,
      updatedAt: new Date().toISOString(),
    };
    void persistSession(nextSession);
  };

  const clearSession = async () => {
    const nextSession = createDefaultSession(defaults);
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

function buildSeededReviewValues(values: Record<string, string>, defaults: ProfileDefaults, now = new Date()) {
  const nextValues = buildDefaultProfileValues(defaults, values);
  if (!nextValues.date?.trim()) {
    nextValues.date = formatVoiceNoteDate(now);
  }
  if (!nextValues.time?.trim()) {
    nextValues.time = formatVoiceNoteTime(now);
  }
  return nextValues;
}

function buildRefreshedVoiceNoteSeedValues(values: Record<string, string>, defaults: ProfileDefaults) {
  const nextValues = { ...values };
  nextValues.observer = defaults.observerDefault.trim();
  nextValues.organization = defaults.organizationDefault.trim();
  nextValues.elevation_unit = defaults.elevationUnitDefault;
  return nextValues;
}

function shouldSeedVoiceNoteMetadata(session: Partial<VoiceNoteSession>) {
  return !Boolean(
    session.profileId ||
      session.transcriptRaw?.trim() ||
      session.engineTextCurrent?.trim() ||
      session.engineTextOriginal?.trim()
  );
}

function formatVoiceNoteDate(date: Date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatVoiceNoteTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function haveSameReviewValues(left: Record<string, string>, right: Record<string, string>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (left[key] ?? '') === (right[key] ?? ''));
}

function resolvePreferredVoiceNoteEngineText(currentText: string, originalText: string) {
  const current = currentText.trim();
  const original = originalText.trim();

  if (!current) {
    return original;
  }
  if (!original) {
    return current;
  }
  if (!shouldPromoteOriginalVoiceNoteText(current, original)) {
    return current;
  }
  return original;
}

function shouldPromoteOriginalVoiceNoteText(currentText: string, originalText: string) {
  const currentParsed = parseFormattedProfile(currentText);
  const originalParsed = parseFormattedProfile(originalText);
  const currentCoreCount = currentParsed.layers.length + currentParsed.temperatures.length + currentParsed.stabilityTests.length;
  const originalCoreCount = originalParsed.layers.length + originalParsed.temperatures.length + originalParsed.stabilityTests.length;
  const currentLooksMetadataOnly = currentParsed.metadata.length > 0 && currentCoreCount === 0;

  return originalCoreCount > currentCoreCount && currentLooksMetadataOnly;
}
