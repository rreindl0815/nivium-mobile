import { Stack, useRouter } from 'expo-router';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';
import { useAuth } from '@/context/auth-context';

export default function AccountScreen() {
  const router = useRouter();
  const { authConfigured, isAuthenticated, signOut, user } = useAuth();
  const { accessSource, isPaid, purchasesConfigured, restorePurchases } = useAppAccess();

  const handleRestore = () => {
    if (!purchasesConfigured) {
      Alert.alert('Restore Unavailable', 'We cannot restore purchases right now. Please try again shortly.');
      return;
    }

    void (async () => {
      try {
        const restored = await restorePurchases();
        Alert.alert(
          restored ? 'Access Restored' : 'No Purchases Found',
          restored
            ? 'Your paid access is active on this device now.'
            : 'We could not find an active paid entitlement for this account.'
        );
      } catch {
        Alert.alert('Restore Failed', 'Please try again in a moment.');
      }
    })();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Account' }} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
          <View style={styles.cardShell}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              <Text style={styles.title}>Nivium Account</Text>
              {!authConfigured ? (
                <Text style={styles.body}>Nivium account sign-in is not configured in this build yet.</Text>
              ) : isAuthenticated && user ? (
                <>
                  <View style={styles.detailGroup}>
                    <Text style={styles.label}>Email</Text>
                    <Text style={styles.value}>{user.email}</Text>
                  </View>
                  {user.displayName ? (
                    <View style={styles.detailGroup}>
                      <Text style={styles.label}>Name</Text>
                      <Text style={styles.value}>{user.displayName}</Text>
                    </View>
                  ) : null}
                  <View style={styles.detailGroup}>
                    <Text style={styles.label}>Nivium User ID</Text>
                    <Text style={styles.valueSmall}>{user.id}</Text>
                  </View>
                  <View style={styles.detailGroup}>
                    <Text style={styles.label}>Paid Access</Text>
                    <Text style={styles.value}>{isPaid ? 'Paid Subscription' : accessSource === 'subscription' ? 'Subscription Syncing' : 'Free'}</Text>
                  </View>
                  <View style={styles.detailGroup}>
                    <Text style={styles.label}>Optional Updates</Text>
                    <Text style={styles.value}>{user.updatesOptIn ? 'Subscribed' : 'Not subscribed'}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.body}>Create or sign in to a Nivium account before purchasing Pro so your subscription stays tied to your email.</Text>
              )}

              <View style={styles.actionStack}>
                {authConfigured && !isAuthenticated ? (
                  <>
                    <Pressable onPress={() => router.push('/create-account' as never)} style={styles.primaryButton}>
                      <Text style={styles.primaryText}>Create Account</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/sign-in' as never)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>Sign In</Text>
                    </Pressable>
                  </>
                ) : null}

                {authConfigured && isAuthenticated ? (
                  <>
                    <Pressable onPress={handleRestore} style={styles.primaryButton}>
                      <Text style={styles.primaryText}>Restore Purchases</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void signOut();
                        router.replace('/');
                      }}
                      style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>Sign Out</Text>
                    </Pressable>
                  </>
                ) : null}

                <Pressable onPress={() => router.replace('/profile-defaults')} style={styles.tertiaryButton}>
                  <Text style={styles.tertiaryText}>Back to Profile Defaults</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
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
    padding: 24,
    gap: 16,
    backgroundColor: '#173248',
  },
  title: {
    color: '#FFF8EE',
    fontSize: 28,
    fontWeight: '800',
  },
  body: {
    color: '#D6E5EE',
    fontSize: 15,
    lineHeight: 22,
  },
  detailGroup: {
    gap: 4,
  },
  label: {
    color: '#AFC3CE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    color: '#FFF8EE',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  valueSmall: {
    color: '#FFF8EE',
    fontSize: 13,
    lineHeight: 20,
  },
  actionStack: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFF8EE',
  },
  primaryText: {
    color: '#173248',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#20384D',
  },
  secondaryText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '700',
  },
  tertiaryButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tertiaryText: {
    color: '#C9DAE4',
    fontSize: 14,
    fontWeight: '700',
  },
});
