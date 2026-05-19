import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/auth-context';

function sanitizeNext(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/account';
  }
  return raw;
}

function ConsentToggle({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.checkboxRow}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

export default function CreateAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const nextRoute = sanitizeNext(params.next);
  const { authConfigured, isBusy, isAuthenticated, requestMagicLink, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [updatesOptIn, setUpdatesOptIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSendLink = () => {
    if (isBusy) {
      return;
    }

    void (async () => {
      try {
        setErrorMessage('');
        const result = await requestMagicLink({
          email,
          displayName,
          updatesOptIn,
          next: nextRoute,
        });
        router.push({
          pathname: '/check-email' as never,
          params: {
            email: email.trim(),
            next: nextRoute,
            mode: 'create',
            ...(result.previewUrl ? { previewUrl: result.previewUrl } : {}),
          },
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to send sign-in link.');
      }
    })();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Create Account' }} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
          <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
            <View style={styles.heroOverlay} />
            <Text style={styles.heroTitle}>Nivium</Text>
            <View style={styles.heroSubtitleStack}>
              <Text style={styles.heroSubtitle}>Account</Text>
              <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
            </View>
          </ImageBackground>

          <View style={styles.cardShell}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardTitle}>Create Your Nivium Account</Text>
              <Text style={styles.cardCopy}>
                Create an account before purchasing Pro so Nivium can restore purchases and connect your subscription to your email.
              </Text>

              {!authConfigured ? (
                <Text style={styles.errorText}>Nivium account sign-in is not configured in this build yet.</Text>
              ) : null}

              {isAuthenticated ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeTitle}>Already signed in</Text>
                  <Text style={styles.noticeText}>{user?.email}</Text>
                </View>
              ) : null}

              <View style={styles.fieldStack}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Email</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={(next) => {
                      setEmail(next);
                      setErrorMessage('');
                    }}
                    placeholder="name@example.com"
                    placeholderTextColor="#8EA3B3"
                    style={styles.fieldInput}
                    value={email}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Name (Optional)</Text>
                  <TextInput
                    onChangeText={(next) => {
                      setDisplayName(next);
                      setErrorMessage('');
                    }}
                    placeholder="Your name"
                    placeholderTextColor="#8EA3B3"
                    style={styles.fieldInput}
                    value={displayName}
                  />
                </View>
              </View>

              <ConsentToggle
                checked={updatesOptIn}
                label="Optional email for occasional Nivium updates. Just the important stuff, never ads, and you can unsubscribe anytime."
                onPress={() => setUpdatesOptIn((current) => !current)}
              />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <View style={styles.actionStack}>
                <Pressable
                  disabled={!authConfigured || isBusy}
                  onPress={handleSendLink}
                  style={[styles.primaryButton, !authConfigured || isBusy ? styles.primaryButtonDisabled : null]}>
                  {isBusy ? <ActivityIndicator color="#173248" /> : <Text style={styles.primaryText}>Email Me a Sign-In Link</Text>}
                </Pressable>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/sign-in' as never,
                      params: { next: nextRoute },
                    })
                  }
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Already Have an Account?</Text>
                </Pressable>

                <Pressable onPress={() => router.replace('/')} style={styles.tertiaryButton}>
                  <Text style={styles.tertiaryText}>Home</Text>
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
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: 8,
    minHeight: 188,
    paddingHorizontal: 24,
    paddingVertical: 22,
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
    fontSize: 40,
    lineHeight: 44,
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
    width: 176,
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
    gap: 16,
  },
  cardAccent: {
    width: 68,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#20384D',
  },
  cardTitle: {
    color: '#FFF8EE',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  cardCopy: {
    color: '#D6E5EE',
    fontSize: 15,
    lineHeight: 22,
  },
  noticeCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#20384D',
    gap: 4,
  },
  noticeTitle: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '800',
  },
  noticeText: {
    color: '#D6E5EE',
    fontSize: 14,
  },
  fieldStack: {
    gap: 14,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: '#D5E4ED',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D536B',
    backgroundColor: '#20384D',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF8EE',
    fontSize: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#8EA3B3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#FFF8EE',
    borderColor: '#FFF8EE',
  },
  checkboxMark: {
    color: '#173248',
    fontSize: 14,
    fontWeight: '900',
  },
  checkboxLabel: {
    flex: 1,
    color: '#D6E5EE',
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: '#FFD0C2',
    fontSize: 14,
    lineHeight: 20,
  },
  actionStack: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8EE',
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
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
