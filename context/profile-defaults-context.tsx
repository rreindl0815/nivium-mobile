import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  DEFAULT_PROFILE_DEFAULTS,
  normalizeElevationUnit,
  type ProfileDefaults,
} from '@/utils/profile-defaults';

const STORAGE_KEY = 'nivium-profile-defaults-v1';

type ProfileDefaultsContextValue = {
  defaults: ProfileDefaults;
  isLoaded: boolean;
  saveDefaults: (nextDefaults: ProfileDefaults) => Promise<void>;
};

const ProfileDefaultsContext = createContext<ProfileDefaultsContextValue | null>(null);

function sanitizeDefaults(defaults: Partial<ProfileDefaults> | null | undefined): ProfileDefaults {
  return {
    observerDefault: defaults?.observerDefault?.trim() ?? '',
    organizationDefault: defaults?.organizationDefault?.trim() ?? '',
    elevationUnitDefault: normalizeElevationUnit(defaults?.elevationUnitDefault),
  };
}

export function ProfileDefaultsProvider({ children }: { children: React.ReactNode }) {
  const [defaults, setDefaults] = useState<ProfileDefaults>(DEFAULT_PROFILE_DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDefaults() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && isMounted) {
          setDefaults(sanitizeDefaults(JSON.parse(stored) as Partial<ProfileDefaults>));
        }
      } catch {
        if (isMounted) {
          setDefaults(DEFAULT_PROFILE_DEFAULTS);
        }
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    }

    void loadDefaults();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveDefaults = async (nextDefaults: ProfileDefaults) => {
    const sanitized = sanitizeDefaults(nextDefaults);
    setDefaults(sanitized);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  };

  return (
    <ProfileDefaultsContext.Provider
      value={{
        defaults,
        isLoaded,
        saveDefaults,
      }}>
      {children}
    </ProfileDefaultsContext.Provider>
  );
}

export function useProfileDefaults() {
  const context = useContext(ProfileDefaultsContext);
  if (!context) {
    throw new Error('useProfileDefaults must be used inside ProfileDefaultsProvider');
  }
  return context;
}
