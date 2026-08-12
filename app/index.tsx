import { type Href, useRouter } from 'expo-router';
import { Alert, Image, ImageBackground, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppAccess } from '@/context/app-access-context';

const actions = [
  {
    route: '/record-notes',
    eyebrow: 'Capture',
    title: 'Voice Notes',
    description: 'Open the voice notes workflow.',
    accent: '#A94C2A',
    requiresPaid: true,
  },
  {
    route: '/manual-entry',
    eyebrow: 'Build',
    title: 'Manual Data Entry',
    description: 'Open the Manual Data Entry workflow.',
    accent: '#3D6B5A',
    requiresPaid: false,
  },
] as const;

const outputActions = [
  {
    route: '/archive',
    eyebrow: 'Output',
    title: 'Archive',
    subtitle: 'Share and Print',
    requiresPaid: true,
  },
] as const;

const utilityAction = {
  route: '/profile-defaults',
  eyebrow: 'Defaults',
  title: 'Profile Defaults',
  subtitle: 'Observer, Organization, Elevation Unit',
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const { isAccessLoading, isPaid } = useAppAccess();

  const handlePaidOnlyPress = (title: string, route: string) => {
    if (isAccessLoading) {
      Alert.alert('Checking Access', 'Nivium is reconnecting your account and subscription. Please try again in a moment.');
      return;
    }
    if (isPaid) {
      router.push(route as Href);
      return;
    }
    router.push({
      pathname: '/upgrade',
      params: { feature: title, returnTo: route },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={require('../assets/images/nivium-hero-snow.png')}
          imageStyle={styles.heroImage}
          style={styles.hero}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <Text style={styles.title}>Nivium</Text>
            <View style={styles.subtitleStack}>
              <View style={styles.voiceRow}>
                <Text style={styles.subtitle}>Voice</Text>
                <Text style={styles.subtitleArrow}>→</Text>
              </View>
              <Text style={styles.subtitle}>Snow Profile</Text>
              <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.subtitleSwish} resizeMode="stretch" />
            </View>
          </View>
        </ImageBackground>

        <View style={styles.entryRow}>
          {actions.map((action) => (
            <Pressable
              key={action.title}
              onPress={() => {
                if (action.requiresPaid) {
                  handlePaidOnlyPress(action.title, action.route);
                  return;
                }
                router.push(action.route);
              }}
              style={({ pressed }) => [
                styles.entryCardShell,
                { transform: [{ scale: pressed ? 0.982 : 1 }, { translateY: pressed ? 2 : 0 }] },
              ]}>
              <View style={styles.entryCardHighlight} />
              <View style={styles.entryCardFrame}>
                <View style={styles.entryCard}>
                  <View style={styles.entryAccent} />
                  <Text style={styles.entryEyebrow}>{action.eyebrow}</Text>
                  <Text style={styles.entryTitle}>{action.title}</Text>
                  <Text style={styles.entryDescription}>{action.description}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <ImageBackground
          source={require('../assets/images/nivium-mid-band.png')}
          imageStyle={styles.bandImage}
          style={styles.band}>
          <View style={styles.bandOverlay} />
        </ImageBackground>

        <View style={styles.outputRow}>
          {outputActions.map((action) => (
            <Pressable
              key={action.title}
              onPress={() => {
                if (action.requiresPaid) {
                  handlePaidOnlyPress(action.title, action.route);
                  return;
                }
                router.push(action.route);
              }}
              style={({ pressed }) => [
                styles.outputCardShell,
                { transform: [{ scale: pressed ? 0.982 : 1 }, { translateY: pressed ? 2 : 0 }] },
              ]}>
              <View style={styles.cardHighlight} />
              <View style={styles.cardFrame}>
                <View style={styles.card}>
                  <View style={styles.cardAccent} />
                  <Text style={styles.cardEyebrow}>{action.eyebrow}</Text>
                  <Text style={styles.cardTitle}>{action.title}</Text>
                  <Text style={styles.cardSubtitle}>{action.subtitle}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => router.push(utilityAction.route)}
          style={({ pressed }) => [
            styles.outputCardShell,
            { transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: pressed ? 2 : 0 }] },
          ]}>
          <View style={styles.cardHighlight} />
          <View style={styles.cardFrame}>
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.cardEyebrow}>{utilityAction.eyebrow}</Text>
              <Text style={styles.cardTitle}>{utilityAction.title}</Text>
              <Text style={styles.cardSubtitle}>{utilityAction.subtitle}</Text>
            </View>
          </View>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 40,
    gap: 20,
  },
  hero: {
    overflow: 'hidden',
    borderRadius: 8,
    minHeight: 220,
    paddingHorizontal: 24,
    paddingVertical: 26,
    justifyContent: 'flex-end',
    shadowColor: '#102433',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 12,
  },
  heroImage: {
    borderRadius: 8,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 20, 36, 0.54)',
  },
  heroContent: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  title: {
    color: '#FFF8EE',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitleStack: {
    marginTop: 'auto',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtitle: {
    color: '#E2EDF4',
    fontSize: 17,
    lineHeight: 24,
  },
  subtitleArrow: {
    color: '#E2EDF4',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  subtitleSwish: {
    marginTop: 2,
    marginRight: -10,
    width: 196,
    height: 24,
    opacity: 0.96,
  },
  entryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  entryCardShell: {
    flex: 1,
    minHeight: 194,
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 14,
  },
  entryCardHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  entryCard: {
    flex: 1,
    minHeight: 188,
    padding: 18,
    backgroundColor: '#BECEDA',
    alignItems: 'center',
  },
  entryCardFrame: {
    flex: 1,
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  entryAccent: {
    width: 48,
    height: 6,
    borderRadius: 999,
    marginBottom: 16,
    backgroundColor: '#20384D',
  },
  entryEyebrow: {
    color: '#876A46',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  entryTitle: {
    marginTop: 8,
    color: '#1F3443',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  entryDescription: {
    marginTop: 10,
    color: '#58656D',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  outputRow: {
    gap: 12,
  },
  band: {
    overflow: 'hidden',
    height: 118,
    borderRadius: 8,
    shadowColor: '#102433',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  bandImage: {
    borderRadius: 8,
  },
  bandOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 31, 48, 0.34)',
  },
  outputCardShell: {
    borderRadius: 8,
    minHeight: 136,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 14,
  },
  cardHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 7,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  card: {
    flex: 1,
    padding: 16,
    backgroundColor: '#BECEDA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFrame: {
    flex: 1,
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  cardAccent: {
    width: 42,
    height: 6,
    borderRadius: 999,
    marginBottom: 12,
    backgroundColor: '#20384D',
  },
  cardEyebrow: {
    color: '#876A46',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    marginTop: 10,
    color: '#1F3443',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardSubtitle: {
    marginTop: 8,
    color: '#4E6272',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});
