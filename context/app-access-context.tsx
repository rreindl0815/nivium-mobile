import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth-context';

type AppTier = 'free' | 'paid';
type AccessSource = 'free' | 'subscription' | 'developer';

type AppAccessContextValue = {
  tier: AppTier;
  isPaid: boolean;
  accessSource: AccessSource;
  purchasesConfigured: boolean;
  revenueCatIdentityReady: boolean;
  setTier: (tier: AppTier) => Promise<void>;
  presentPaywall: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
};

const STORAGE_KEY = 'nivium-app-tier-v2';
const TESTER_UNLOCK_ENABLED = process.env.EXPO_PUBLIC_NIVIUM_TESTER_UNLOCK === '1';
const DEV_ACCESS_UNLOCK_ENABLED = __DEV__;
const DEFAULT_TIER: AppTier = TESTER_UNLOCK_ENABLED ? 'paid' : 'free';
const EXPO_GO_NATIVE_PURCHASES_UNAVAILABLE =
  Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ?? '';
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? '';
const REVENUECAT_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'pro';

const AppAccessContext = createContext<AppAccessContextValue | null>(null);

function getRevenueCatApiKey() {
  if (Platform.OS === 'ios') {
    return REVENUECAT_IOS_API_KEY;
  }
  if (Platform.OS === 'android') {
    return REVENUECAT_ANDROID_API_KEY;
  }
  return '';
}

function hasPaidEntitlement(customerInfo: CustomerInfo | null) {
  return Boolean(customerInfo?.entitlements.active?.[REVENUECAT_ENTITLEMENT_ID]);
}

export function AppAccessProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: authLoaded, user } = useAuth();
  const [tier, setTierState] = useState<AppTier>(DEFAULT_TIER);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [purchasesConfigured, setPurchasesConfigured] = useState(false);
  const [revenueCatIdentityReady, setRevenueCatIdentityReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadTier() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) {
          return;
        }
        if (TESTER_UNLOCK_ENABLED || DEV_ACCESS_UNLOCK_ENABLED) {
          setTierState('paid');
          await AsyncStorage.setItem(STORAGE_KEY, 'paid');
          return;
        }
        if (stored === 'free' || stored === 'paid') {
          const nextTier = stored === 'paid' ? 'free' : stored;
          setTierState(nextTier);
          if (stored === 'paid') {
            await AsyncStorage.setItem(STORAGE_KEY, nextTier);
          }
        }
      } catch {
        if (mounted) {
          setTierState(DEFAULT_TIER);
        }
      }
    }

    void loadTier();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const apiKey = getRevenueCatApiKey();
    if (!apiKey || Platform.OS === 'web' || EXPO_GO_NATIVE_PURCHASES_UNAVAILABLE) {
      setPurchasesConfigured(false);
      setRevenueCatIdentityReady(false);
      return;
    }

    const listener = (nextCustomerInfo: CustomerInfo) => {
      setCustomerInfo(nextCustomerInfo);
    };

    try {
      if (__DEV__) {
        void Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }
      Purchases.configure({ apiKey });
      setPurchasesConfigured(true);
      setRevenueCatIdentityReady(false);
      Purchases.addCustomerInfoUpdateListener(listener);
      void Purchases.getCustomerInfo()
        .then((info) => {
          setCustomerInfo(info);
        })
        .catch(() => {
          setCustomerInfo(null);
        });
    } catch {
      setPurchasesConfigured(false);
      setRevenueCatIdentityReady(false);
    }

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!authLoaded || Platform.OS === 'web') {
      return () => {
        isMounted = false;
      };
    }

    if (!purchasesConfigured) {
      if (isMounted) {
        setRevenueCatIdentityReady(true);
      }
      return () => {
        isMounted = false;
      };
    }

    void (async () => {
      setRevenueCatIdentityReady(false);
      try {
        const currentAppUserId = await Purchases.getAppUserID().catch(() => '');
        let identityReady = currentAppUserId === user?.id;
        let latestCustomerInfo: CustomerInfo | null = null;

        if (user) {
          if (currentAppUserId !== user.id) {
            try {
              const result = await Purchases.logIn(user.id);
              identityReady = true;
              latestCustomerInfo = result.customerInfo;
              if (!isMounted) {
                return;
              }
              setCustomerInfo(result.customerInfo);
            } catch (error) {
              console.warn('RevenueCat app user sync failed', error);
            }
          }

          try {
            await Purchases.setEmail(user.email);
            await Purchases.setDisplayName(user.displayName?.trim() ? user.displayName.trim() : null);
            await Purchases.syncAttributesAndOfferingsIfNeeded().catch(() => null);
          } catch (error) {
            console.warn('RevenueCat customer attribute sync failed', error);
          }

          try {
            const refreshedCustomerInfo = await Purchases.getCustomerInfo();
            latestCustomerInfo = refreshedCustomerInfo;
          } catch (error) {
            console.warn('RevenueCat customer refresh failed', error);
          }

          if (!isMounted) {
            return;
          }
          if (latestCustomerInfo) {
            setCustomerInfo(latestCustomerInfo);
          }
          setRevenueCatIdentityReady(identityReady);
          return;
        }

        const anonymous = await Purchases.isAnonymous().catch(() => currentAppUserId.startsWith('$RCAnonymousID:'));
        if (!anonymous) {
          const loggedOutInfo = await Purchases.logOut();
          if (!isMounted) {
            return;
          }
          setCustomerInfo(loggedOutInfo);
        }

        if (isMounted) {
          setRevenueCatIdentityReady(true);
        }
      } catch {
        if (isMounted) {
          setRevenueCatIdentityReady(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [authLoaded, purchasesConfigured, user]);

  const value = useMemo<AppAccessContextValue>(
    () => {
      const subscriptionActive = hasPaidEntitlement(customerInfo);
      const testerUnlockActive = TESTER_UNLOCK_ENABLED && tier === 'paid';
      const developerUnlockActive = DEV_ACCESS_UNLOCK_ENABLED;
      const isPaid = developerUnlockActive || testerUnlockActive || subscriptionActive;
      return {
        tier,
        isPaid,
        accessSource: developerUnlockActive ? 'developer' : subscriptionActive ? 'subscription' : 'free',
        purchasesConfigured,
        revenueCatIdentityReady,
        setTier: async (nextTier) => {
          setTierState(nextTier);
          await AsyncStorage.setItem(STORAGE_KEY, nextTier);
        },
        presentPaywall: async () => {
          if (!purchasesConfigured) {
            return false;
          }
          try {
            const offerings = await Purchases.getOfferings().catch(() => null);
            const fallbackOffering =
              offerings?.current ??
              (offerings
                ? Object.values(offerings.all).find((offering) => offering.availablePackages.length > 0)
                : undefined);

            try {
              await RevenueCatUI.presentPaywall({
                ...(fallbackOffering ? { offering: fallbackOffering } : {}),
                displayCloseButton: true,
              });
            } catch {
              await RevenueCatUI.presentPaywallIfNeeded({
                requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
                ...(fallbackOffering ? { offering: fallbackOffering } : {}),
                displayCloseButton: true,
              });
            }

            const refreshedCustomerInfo = await Purchases.getCustomerInfo();
            setCustomerInfo(refreshedCustomerInfo);
            return hasPaidEntitlement(refreshedCustomerInfo);
          } catch {
            return false;
          }
        },
        restorePurchases: async () => {
          if (!purchasesConfigured) {
            return false;
          }

          const restoredCustomerInfo = await Purchases.restorePurchases();
          setCustomerInfo(restoredCustomerInfo);
          return hasPaidEntitlement(restoredCustomerInfo);
        },
      };
    },
    [customerInfo, purchasesConfigured, revenueCatIdentityReady, tier]
  );

  return <AppAccessContext.Provider value={value}>{children}</AppAccessContext.Provider>;
}

export function useAppAccess() {
  const context = useContext(AppAccessContext);
  if (!context) {
    throw new Error('useAppAccess must be used inside AppAccessProvider');
  }
  return context;
}
