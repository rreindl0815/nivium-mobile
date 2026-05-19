import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/auth-context';

function sanitizeNext(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/account';
  }
  return raw;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; next?: string }>();
  const { authConfigured, completeMagicLinkSignIn } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');
  const startedRef = useRef(false);
  const nextRoute = sanitizeNext(params.next);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    if (!authConfigured) {
      setErrorMessage('Nivium account sign-in is not configured in this build yet.');
      return;
    }

    const token = Array.isArray(params.token) ? params.token[0] : params.token;
    if (!token?.trim()) {
      setErrorMessage('This sign-in link is missing its token. Please request a new email link.');
      return;
    }

    void (async () => {
      try {
        await completeMagicLinkSignIn(token.trim());
        router.replace(nextRoute as never);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to complete sign-in.');
      }
    })();
  }, [authConfigured, completeMagicLinkSignIn, nextRoute, params.token, router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Sign In' }} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.cardShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.card}>
            <Text style={styles.title}>{errorMessage ? 'Sign-In Link Problem' : 'Opening Nivium'}</Text>
            {errorMessage ? (
              <Text style={styles.body}>{errorMessage}</Text>
            ) : (
              <>
                <ActivityIndicator color="#FFF8EE" />
                <Text style={styles.body}>Please wait while Nivium signs you in.</Text>
              </>
            )}

            <View style={styles.actionStack}>
              {errorMessage ? (
                <Pressable onPress={() => router.replace('/sign-in' as never)} style={styles.primaryButton}>
                  <Text style={styles.primaryText}>Request Another Link</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => router.replace('/')} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
    justifyContent: 'center',
    padding: 20,
  },
  cardShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
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
    fontSize: 24,
    fontWeight: '800',
  },
  body: {
    color: '#D9E4EA',
    fontSize: 15,
    lineHeight: 22,
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
});
