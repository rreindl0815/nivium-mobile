import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type AppTier = 'free' | 'paid';
type AccessSource = 'free' | 'subscription';

type AppAccessContextValue = {
  tier: AppTier;
  isPaid: boolean;
  accessSource: AccessSource;
  purchasesConfigured: boolean;
  setTier: (tier: AppTier) => Promise<void>;
  presentPaywall: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
};

const STORAGE_KEY = 'nivium-app-tier-v2';
const DEFAULT_TIER: AppTier = __DEV__ ? 'paid' : 'free';
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
  const [tier, setTierState] = useState<AppTier>(DEFAULT_TIER);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [purchasesConfigured, setPurchasesConfigured] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadTier() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) {
          return;
        }
        if (__DEV__) {
          setTierState('paid');
          await AsyncStorage.setItem(STORAGE_KEY, 'paid');
          return;
        }
        if (stored === 'free' || stored === 'paid') {
          const nextTier = stored === 'paid' ? 'free' : stored;
          setTierState(nextTier);
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
    if (!apiKey || Platform.OS === 'web') {
      setPurchasesConfigured(false);
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
    }

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const value = useMemo<AppAccessContextValue>(
    () => {
      const subscriptionActive = hasPaidEntitlement(customerInfo);
      const testerUnlockActive = __DEV__ && tier === 'paid';
      return {
      tier,
      isPaid: testerUnlockActive || subscriptionActive,
      accessSource: subscriptionActive ? 'subscription' : 'free',
      purchasesConfigured,
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
    [customerInfo, purchasesConfigured, tier]
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
