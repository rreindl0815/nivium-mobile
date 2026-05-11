import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { SelectorField } from '@/components/profile-editor/selector-field';
import { useProfileDefaults } from '@/context/profile-defaults-context';
import { elevationUnitOptions, normalizeElevationUnit } from '@/utils/profile-defaults';

export default function ProfileDefaultsScreen() {
  const router = useRouter();
  const { defaults, isLoaded, saveDefaults } = useProfileDefaults();
  const [observerDefault, setObserverDefault] = useState('');
  const [organizationDefault, setOrganizationDefault] = useState('');
  const [elevationUnitDefault, setElevationUnitDefault] = useState<'m' | 'ft'>('m');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    setObserverDefault(defaults.observerDefault);
    setOrganizationDefault(defaults.organizationDefault);
    setElevationUnitDefault(normalizeElevationUnit(defaults.elevationUnitDefault));
  }, [defaults, isLoaded]);

  const handleSave = () => {
    if (isSaving) {
      return;
    }

    void (async () => {
      setIsSaving(true);
      try {
        await saveDefaults({
          observerDefault,
          organizationDefault,
          elevationUnitDefault: normalizeElevationUnit(elevationUnitDefault),
        });
        setSaveMessage('Saved. New profiles will use these defaults.');
      } finally {
        setIsSaving(false);
      }
    })();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Profile Defaults' }} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
          <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
            <View style={styles.heroOverlay} />
            <Text style={styles.heroTitle}>Nivium</Text>
            <View style={styles.heroSubtitleStack}>
              <Text style={styles.heroSubtitle}>Profile Defaults</Text>
              <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
            </View>
          </ImageBackground>

          <View style={styles.cardShell}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              <View style={styles.cardAccent} />
              <Text style={styles.sectionLabel}>Prefill</Text>
              <Text style={styles.cardTitle}>Use your normal observer details automatically.</Text>
              <Text style={styles.cardCopy}>
                These defaults apply to brand-new Voice Notes and Manual Data Entry profiles. Existing profiles keep their saved
                values. Elevation unit also controls how elevation prints on the plotted profile.
              </Text>

              {!isLoaded ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color="#F4E2C4" />
                  <Text style={styles.loadingText}>Loading defaults...</Text>
                </View>
              ) : (
                <View style={styles.fieldStack}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Observer Default</Text>
                    <TextInput
                      value={observerDefault}
                      onChangeText={(next) => {
                        setObserverDefault(next);
                        setSaveMessage('');
                      }}
                      placeholder="Observer name"
                      placeholderTextColor="#8EA3B3"
                      style={styles.fieldInput}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Organization Default</Text>
                    <TextInput
                      value={organizationDefault}
                      onChangeText={(next) => {
                        setOrganizationDefault(next);
                        setSaveMessage('');
                      }}
                      placeholder="Organization"
                      placeholderTextColor="#8EA3B3"
                      style={styles.fieldInput}
                    />
                  </View>

                  <SelectorField
                    label="Elevation Unit Default"
                    value={elevationUnitDefault}
                    placeholder="Choose unit"
                    options={elevationUnitOptions}
                    onSelect={(next) => {
                      setElevationUnitDefault(normalizeElevationUnit(next));
                      setSaveMessage('');
                    }}
                  />

                  <View style={styles.noteBox}>
                    <Text style={styles.noteTitle}>How it behaves</Text>
                    <Text style={styles.noteCopy}>New profiles start with these values.</Text>
                    <Text style={styles.noteCopy}>You can still change observer, organization, and elevation unit in review.</Text>
                    <Text style={styles.noteCopy}>Saved profiles keep the elevation unit they were created with.</Text>
                  </View>
                </View>
              )}

              {saveMessage ? <Text style={styles.saveMessage}>{saveMessage}</Text> : null}

              <View style={styles.actionStack}>
                <Pressable onPress={handleSave} disabled={!isLoaded || isSaving} style={styles.primaryShell}>
                  <View style={styles.primaryHighlight} />
                  <View style={styles.primaryFrame}>
                    <View style={[styles.primaryButton, !isLoaded || isSaving ? styles.primaryButtonDisabled : null]}>
                      <Text style={styles.primaryText}>{isSaving ? 'Saving...' : 'Save Defaults'}</Text>
                    </View>
                  </View>
                </Pressable>

                <Pressable onPress={() => router.replace('/')} style={styles.secondaryShell}>
                  <View style={styles.secondaryFrame}>
                    <View style={styles.secondaryButton}>
                      <Text style={styles.secondaryText}>Home</Text>
                    </View>
                  </View>
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
  heroImage: {
    borderRadius: 8,
  },
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
  sectionLabel: {
    color: '#B9D2E3',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#FFF8EE',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
  },
  cardCopy: {
    color: '#D6E5EE',
    fontSize: 15,
    lineHeight: 22,
  },
  loadingState: {
    borderRadius: 8,
    padding: 18,
    backgroundColor: '#20384D',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#D6E5EE',
    fontSize: 14,
    fontWeight: '600',
  },
  fieldStack: {
    gap: 14,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: '#D5E4ED',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6E879A',
    backgroundColor: '#F6FAFC',
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  noteBox: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#20384D',
    gap: 6,
  },
  noteTitle: {
    color: '#F4E2C4',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteCopy: {
    color: '#D6E5EE',
    fontSize: 14,
    lineHeight: 20,
  },
  saveMessage: {
    color: '#F4E2C4',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  actionStack: {
    gap: 10,
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
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  primaryFrame: {
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
  primaryButton: {
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#4C6A83',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#FFF8EE',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  secondaryShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  secondaryFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.1)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  secondaryButton: {
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#D4E0E9',
  },
  secondaryText: {
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
});
