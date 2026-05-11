import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { useProfileDefaults } from '@/context/profile-defaults-context';
import { fieldCardSections } from '@/data/field-card';
import type { ProfileDraft } from '@/types/profile';
import { buildDefaultProfileValues } from '@/utils/profile-defaults';
import { extractDraftValuesFromRawNotes } from '@/utils/raw-note-parser';
import { formatVoiceNotesForEditing } from '@/utils/voice-notes-format';

const STORAGE_KEY = 'skeena-profile-draft-v2';
const LEGACY_STORAGE_KEYS = ['skeena-profile-draft'];
const ALL_DRAFT_KEYS = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

type DraftContextValue = {
  draft: ProfileDraft;
  isLoaded: boolean;
  setRawNotes: (value: string) => void;
  setRawNotesFromVoiceInput: (value: string) => void;
  finalizeVoiceNotesFormatting: () => void;
  setFieldValue: (fieldId: string, value: string) => void;
  mergeFieldValues: (values: Record<string, string>) => void;
  replaceFieldValues: (values: Record<string, string>) => void;
  loadFreshRawNotes: (value: string) => void;
  loadFreshDraft: (next: { rawNotes?: string; values?: Record<string, string> }) => void;
  resetDraft: () => Promise<void>;
  completedFields: number;
  totalFields: number;
};

const allFieldIds = fieldCardSections.flatMap((section) => section.fields.map((field) => field.id));

const createDefaultDraft = (values: Record<string, string> = {}): ProfileDraft => ({
  rawNotes: '',
  values,
  updatedAt: new Date().toISOString(),
});

const DraftContext = createContext<DraftContextValue | null>(null);

export function ProfileDraftProvider({ children }: { children: React.ReactNode }) {
  const { defaults, isLoaded: areDefaultsLoaded } = useProfileDefaults();
  const [draft, setDraft] = useState<ProfileDraft>(() => createDefaultDraft(buildDefaultProfileValues(defaults)));
  const [isLoaded, setIsLoaded] = useState(false);
  const hasInitializedRef = useRef(false);
  const writeVersionRef = useRef(0);
  const draftRef = useRef<ProfileDraft>(createDefaultDraft(buildDefaultProfileValues(defaults)));

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!areDefaultsLoaded || hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    let isMounted = true;
    async function loadDraft() {
      try {
        await Promise.all(ALL_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key)));
        if (isMounted) {
          setDraft(createDefaultDraft(buildDefaultProfileValues(defaults)));
        }
      } catch {
        if (isMounted) {
          setDraft(createDefaultDraft(buildDefaultProfileValues(defaults)));
        }
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    loadDraft();

    return () => {
      isMounted = false;
    };
  }, [areDefaultsLoaded, defaults]);

  const persistDraft = async (nextDraft: ProfileDraft) => {
    const writeVersion = writeVersionRef.current + 1;
    writeVersionRef.current = writeVersion;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
    if (writeVersion !== writeVersionRef.current) {
      return;
    }
  };

  const updateDraft = (updater: (currentDraft: ProfileDraft) => ProfileDraft) => {
    const nextDraft = updater(draftRef.current);
    void persistDraft(nextDraft);
  };

  const setRawNotes = (value: string) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      rawNotes: value,
      updatedAt: new Date().toISOString(),
    }));
  };

  const setRawNotesFromVoiceInput = (value: string) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      rawNotes: value,
      // Voice Notes should start from a clean field state to avoid
      // carrying stale MED/sample values into new AI-formatted runs.
      values: buildDefaultProfileValues(defaults),
      updatedAt: new Date().toISOString(),
    }));
  };

  const finalizeVoiceNotesFormatting = () => {
    const currentRawNotes = draftRef.current.rawNotes;
    if (!currentRawNotes.trim()) {
      return;
    }

    const formattedRawNotes = formatVoiceNotesForEditing(currentRawNotes);
    const extractedValues = extractDraftValuesFromRawNotes(formattedRawNotes);

    updateDraft((currentDraft) => {
      const nextValues = { ...currentDraft.values };

      Object.entries(extractedValues).forEach(([fieldId, extractedValue]) => {
        const currentValue = (nextValues[fieldId] ?? '').trim();
        if (!currentValue && extractedValue.trim()) {
          nextValues[fieldId] = extractedValue;
        }
      });

      return {
        ...currentDraft,
        rawNotes: formattedRawNotes,
        values: nextValues,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const setFieldValue = (fieldId: string, value: string) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      values: {
        ...currentDraft.values,
        [fieldId]: value,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const mergeFieldValues = (values: Record<string, string>) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      values: {
        ...currentDraft.values,
        ...values,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const replaceFieldValues = (values: Record<string, string>) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      values: {
        ...createDefaultDraft().values,
        ...values,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const loadFreshRawNotes = (value: string) => {
    void persistDraft({
      ...createDefaultDraft(buildDefaultProfileValues(defaults)),
      rawNotes: value,
      updatedAt: new Date().toISOString(),
    });
  };

  const loadFreshDraft = (next: { rawNotes?: string; values?: Record<string, string> }) => {
    void persistDraft({
      ...createDefaultDraft(buildDefaultProfileValues(defaults, next.values ?? {})),
      rawNotes: next.rawNotes ?? '',
      values: buildDefaultProfileValues(defaults, next.values ?? {}),
      updatedAt: new Date().toISOString(),
    });
  };

  const resetDraft = async () => {
    const nextDraft = createDefaultDraft(buildDefaultProfileValues(defaults));
    writeVersionRef.current += 1;
    setDraft(nextDraft);
    await Promise.all(ALL_DRAFT_KEYS.map((key) => AsyncStorage.removeItem(key)));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextDraft));
  };

  const completedFields = allFieldIds.filter((fieldId) => {
    const value = draft.values[fieldId];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;

  return (
    <DraftContext.Provider
      value={{
        draft,
        isLoaded,
        setRawNotes,
        setRawNotesFromVoiceInput,
        finalizeVoiceNotesFormatting,
        setFieldValue,
        mergeFieldValues,
        replaceFieldValues,
        loadFreshRawNotes,
        loadFreshDraft,
        resetDraft,
        completedFields,
        totalFields: allFieldIds.length,
      }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useProfileDraft() {
  const context = useContext(DraftContext);

  if (!context) {
    throw new Error('useProfileDraft must be used inside ProfileDraftProvider');
  }

  return context;
}
