import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

type AppTier = 'free' | 'paid';
type AccessSource = 'free' | 'subscription';
type PaywallResultStatus = 'purchased' | 'not-entitled' | 'cancelled' | 'unavailable' | 'error';
type RestoreResultStatus = 'restored' | 'not-found' | 'unavailable' | 'error';

export type PaywallResult = {
  status: PaywallResultStatus;
  message?: string;
};

export type RestoreResult = {
  status: RestoreResultStatus;
  message?: string;
};

type AppAccessContextValue = {
  tier: AppTier;
  isPaid: boolean;
  accessSource: AccessSource;
  purchasesConfigured: boolean;
  purchaseConfigIssue: 'unsupported-platform' | 'missing-api-key' | 'configure-failed' | null;
  setTier: (tier: AppTier) => Promise<void>;
  presentPaywall: () => Promise<PaywallResult>;
  restorePurchases: () => Promise<RestoreResult>;
};

const STORAGE_KEY = 'nivium-app-tier-v2';
const DEFAULT_TIER: AppTier = 'free';
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

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown purchase error.';
}

export function AppAccessProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTierState] = useState<AppTier>(DEFAULT_TIER);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [purchasesConfigured, setPurchasesConfigured] = useState(false);
  const [purchaseConfigIssue, setPurchaseConfigIssue] =
    useState<AppAccessContextValue['purchaseConfigIssue']>(null);

  useEffect(() => {
    let mounted = true;

    async function loadTier() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) {
          return;
        }
        if (stored === 'free' || stored === 'paid') {
          const nextTier = __DEV__ ? stored : stored === 'paid' ? 'free' : stored;
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
    if (Platform.OS === 'web') {
      setPurchasesConfigured(false);
      setPurchaseConfigIssue('unsupported-platform');
      return;
    }

    if (!apiKey) {
      setPurchasesConfigured(false);
      setPurchaseConfigIssue('missing-api-key');
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
      setPurchaseConfigIssue(null);
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
      setPurchaseConfigIssue('configure-failed');
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
      purchaseConfigIssue,
      setTier: async (nextTier) => {
        setTierState(nextTier);
        await AsyncStorage.setItem(STORAGE_KEY, nextTier);
      },
      presentPaywall: async () => {
        if (!purchasesConfigured) {
          return { status: 'unavailable', message: 'Purchases are not configured for this build.' };
        }
        try {
          const offerings = await Purchases.getOfferings().catch(() => null);
          const fallbackOffering =
            offerings?.current ??
            (offerings
              ? Object.values(offerings.all).find((offering) => offering.availablePackages.length > 0)
              : undefined);
          if (!fallbackOffering || fallbackOffering.availablePackages.length === 0) {
            return {
              status: 'unavailable',
              message: 'No purchasable plans were returned from the App Store for this build.',
            };
          }

          try {
            await RevenueCatUI.presentPaywall({
              offering: fallbackOffering,
              displayCloseButton: true,
            });
          } catch (paywallError) {
            const message = describeError(paywallError);
            if (/cancel/i.test(message)) {
              return { status: 'cancelled' };
            }
            await RevenueCatUI.presentPaywallIfNeeded({
              requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
              offering: fallbackOffering,
              displayCloseButton: true,
            });
          }

          const refreshedCustomerInfo = await Purchases.getCustomerInfo();
          setCustomerInfo(refreshedCustomerInfo);
          return hasPaidEntitlement(refreshedCustomerInfo)
            ? { status: 'purchased' }
            : { status: 'not-entitled' };
        } catch (error) {
          return { status: 'error', message: describeError(error) };
        }
      },
      restorePurchases: async () => {
        if (!purchasesConfigured) {
          return { status: 'unavailable', message: 'Purchases are not configured for this build.' };
        }
        try {
          const restoredCustomerInfo = await Purchases.restorePurchases();
          setCustomerInfo(restoredCustomerInfo);
          return hasPaidEntitlement(restoredCustomerInfo)
            ? { status: 'restored' }
            : { status: 'not-found' };
        } catch (error) {
          return { status: 'error', message: describeError(error) };
        }
      },
    };
    },
    [customerInfo, purchaseConfigIssue, purchasesConfigured, tier]
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
