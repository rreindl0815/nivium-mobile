import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

function sanitizeNext(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/account';
  }
  return raw;
}

export default function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: string; next?: string; previewUrl?: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : params.email;
  const previewUrl = Array.isArray(params.previewUrl) ? params.previewUrl[0] : params.previewUrl;
  const nextRoute = sanitizeNext(params.next);
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const backRoute = mode === 'sign-in' ? '/sign-in' : '/create-account';

  return (
    <>
      <Stack.Screen options={{ title: 'Check Email' }} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
          <View style={styles.cardShell}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              <Text style={styles.title}>Check Your Email</Text>
              <Text style={styles.body}>
                We sent a Nivium sign-in link to {email || 'your email address'}. Open the message on this device and tap the link to continue.
              </Text>
              <Text style={styles.body}>
                If the email takes a moment, check spam or promotions and then try again.
              </Text>

              {previewUrl ? (
                <View style={styles.previewCard}>
                  <Text style={styles.previewTitle}>Local testing link</Text>
                  <Text style={styles.previewBody}>This build is using a preview sign-in link instead of email delivery.</Text>
                  <Pressable onPress={() => void Linking.openURL(previewUrl)} style={styles.primaryButton}>
                    <Text style={styles.primaryText}>Open Preview Link</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.actionStack}>
                <Pressable
                  onPress={() =>
                    router.replace({
                      pathname: backRoute as never,
                      params: { next: nextRoute },
                    })
                  }
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Use a Different Email</Text>
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
  previewCard: {
    borderRadius: 8,
    padding: 14,
    gap: 10,
    backgroundColor: '#20384D',
  },
  previewTitle: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '800',
  },
  previewBody: {
    color: '#D6E5EE',
    fontSize: 14,
    lineHeight: 21,
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
