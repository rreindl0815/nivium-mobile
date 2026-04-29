import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, ImageBackground, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';

export default function UpgradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ feature?: string; returnTo?: string }>();
  const { accessSource, presentPaywall, purchasesConfigured, purchaseConfigIssue, restorePurchases } = useAppAccess();
  const [isOpeningPaywall, setIsOpeningPaywall] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const feature = params.feature ?? 'This feature';
  const termsUrl = 'https://nivium.ca/terms.html';
  const privacyUrl = 'https://nivium.ca/privacy.html';

  const purchaseUnavailableMessage =
    purchaseConfigIssue === 'missing-api-key'
      ? 'Paid plans are not configured for this platform build yet. Please try again shortly.'
      : purchaseConfigIssue === 'unsupported-platform'
        ? 'Purchases are unavailable on web. Please open Nivium on iOS or Android.'
        : 'Paid plans are temporarily unavailable in this build. Please try again shortly.';

  const handlePaidAccess = () => {
    void (async () => {
      if (isOpeningPaywall || isRestoring) {
        return;
      }
      if (!purchasesConfigured) {
        Alert.alert('Purchases Unavailable', purchaseUnavailableMessage);
        return;
      }

      setIsOpeningPaywall(true);
      try {
        const result = await presentPaywall();
        if (result.status === 'purchased') {
          if (params.returnTo) {
            router.replace(params.returnTo as never);
            return;
          }
          router.replace('/');
          return;
        }
        if (result.status === 'cancelled') {
          return;
        }
        if (result.status === 'unavailable') {
          Alert.alert('Purchases Unavailable', result.message ?? purchaseUnavailableMessage);
          return;
        }
        if (result.status === 'error') {
          Alert.alert(
            'Unable To Open Paywall',
            result.message
              ? `Please try again in a moment.\n\nDetails: ${result.message}`
              : 'Please try again in a moment.'
          );
          return;
        }
        Alert.alert('Paid Access Not Active Yet', 'Please complete purchase or tap Restore Purchases.');
      } finally {
        setIsOpeningPaywall(false);
      }
    })();
  };

  const handleRestorePurchases = () => {
    void (async () => {
      if (isOpeningPaywall || isRestoring) {
        return;
      }
      if (!purchasesConfigured) {
        Alert.alert('Restore Unavailable', purchaseUnavailableMessage);
        return;
      }

      setIsRestoring(true);
      try {
        const result = await restorePurchases();
        if (result.status === 'unavailable') {
          Alert.alert('Restore Unavailable', result.message ?? purchaseUnavailableMessage);
          return;
        }
        if (result.status === 'error') {
          Alert.alert(
            'Restore Failed',
            result.message ? `Please try again in a moment.\n\nDetails: ${result.message}` : 'Please try again in a moment.'
          );
          return;
        }
        const restored = result.status === 'restored';
        Alert.alert(
          restored ? 'Access Restored' : 'No Purchases Found',
          restored
            ? 'Your paid access is active on this device now.'
            : 'We could not find an active paid entitlement for this account.'
        );
        if (restored) {
          if (params.returnTo) {
            router.replace(params.returnTo as never);
            return;
          }
          router.replace('/');
        }
      } finally {
        setIsRestoring(false);
      }
    })();
  };

  const handleOpenLink = (url: string, label: string) => {
    void (async () => {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Link Unavailable', `Could not open ${label} right now.`);
        return;
      }
      await Linking.openURL(url);
    })();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Nivium</Text>
          <View style={styles.heroSubtitleStack}>
            <Text style={styles.heroSubtitle}>Upgrade</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.cardShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.card}>
            <View style={styles.cardAccent} />
            <Text style={styles.sectionLabel}>Paid Access</Text>
            <Text style={styles.cardTitle}>{feature} Requires Paid Access</Text>
            <Text style={styles.cardCopy}>
              Paid access unlocks Voice Notes, Archive, Share, and Print. Free access stays focused on Manual Data Entry and viewing
              the finished plotted profile.
            </Text>
            <Text style={styles.cardCopy}>
              Auto-renewable subscriptions: Nivium Pro Monthly (1 month) and Nivium Pro Yearly (1 year). The App Store paywall
              shows the current price and billing period before purchase.
            </Text>
            <Text style={styles.modeCopy}>
              Current access: {accessSource === 'subscription' ? 'Paid Subscription' : 'Free'}
            </Text>
            <View style={styles.linkRow}>
              <Pressable onPress={() => handleOpenLink(privacyUrl, 'Privacy Policy')} style={styles.linkButton}>
                <Text style={styles.linkText}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.linkDivider}>•</Text>
              <Pressable onPress={() => handleOpenLink(termsUrl, 'Terms of Use (EULA)')} style={styles.linkButton}>
                <Text style={styles.linkText}>Terms of Use (EULA)</Text>
              </Pressable>
            </View>

            <View style={styles.actionStack}>
              <Pressable
                onPress={handlePaidAccess}
                style={[styles.primaryShell, isOpeningPaywall || isRestoring ? styles.disabledShell : null]}
                disabled={isOpeningPaywall || isRestoring}>
                <View style={styles.primaryHighlight} />
                <View style={styles.primaryFrame}>
                  <View style={styles.primaryButton}>
                    <Text style={styles.primaryText}>{isOpeningPaywall ? 'Opening Paywall...' : 'View Paid Access'}</Text>
                  </View>
                </View>
              </Pressable>

              <View style={styles.row}>
                <Pressable
                  onPress={handleRestorePurchases}
                  style={[styles.secondaryShell, isOpeningPaywall || isRestoring ? styles.disabledShell : null]}
                  disabled={isOpeningPaywall || isRestoring}>
                  <View style={styles.secondaryFrame}>
                    <View style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>{isRestoring ? 'Restoring...' : 'Restore Purchases'}</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => router.replace('/')}
                  style={[styles.secondaryShell, isOpeningPaywall || isRestoring ? styles.disabledShell : null]}
                  disabled={isOpeningPaywall || isRestoring}>
                  <View style={styles.secondaryFrame}>
                    <View style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>Home</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  panel: {
    padding: 20,
    paddingTop: 72,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: 8,
    minHeight: 220,
    paddingHorizontal: 24,
    paddingVertical: 26,
    justifyContent: 'flex-end',
    backgroundColor: '#10253A',
    shadowColor: '#102433',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 12,
  },
  heroImage: { borderRadius: 8 },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 36, 0.54)',
  },
  heroTitle: {
    color: '#FFF8EE',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroSubtitleStack: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  heroSubtitle: {
    color: '#E2EDF4',
    fontSize: 17,
    lineHeight: 24,
  },
  heroSubtitleSwish: {
    marginTop: 2,
    marginRight: -10,
    width: 132,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  cardShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  cardHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  card: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
  },
  cardAccent: {
    width: 68,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#20384D',
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#B7CCD8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardTitle: {
    marginTop: 8,
    color: '#FFF8EE',
    fontSize: 24,
    fontWeight: '800',
  },
  cardCopy: {
    marginTop: 10,
    color: '#D9E4EA',
    fontSize: 15,
    lineHeight: 22,
  },
  modeCopy: {
    marginTop: 10,
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  linkRow: {
    marginTop: 8,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  linkButton: {
    paddingVertical: 2,
  },
  linkText: {
    color: '#D6E8F6',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  linkDivider: {
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  actionStack: {
    marginTop: 18,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  disabledShell: {
    opacity: 0.6,
  },
  primaryShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  primaryHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  primaryFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    borderRadius: 3,
    backgroundColor: '#2C5273',
  },
  primaryText: {
    color: '#FFF8EE',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryShell: {
    flex: 1,
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  secondaryFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.12)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.28)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.42)',
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 3,
    backgroundColor: '#D6E0E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#20384D',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
