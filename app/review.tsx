import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useProfileDraft } from '@/context/profile-draft-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { requiredFieldIds } from '@/data/field-card';
import { useFormattedDraft } from '@/hooks/use-formatted-draft';
import { parseFormattedProfile } from '@/utils/profile-document';

export default function ReviewScreen() {
  const router = useRouter();
  const { draft } = useProfileDraft();
  const { createProfileFromDraft } = useSavedProfiles();
  const { formattedText, warnings } = useFormattedDraft();
  const [saveMessage, setSaveMessage] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const parsed = parseFormattedProfile(formattedText);
  const missingFields = requiredFieldIds.filter((fieldId) => !(draft.values[fieldId] ?? '').trim());
  const canCreate = formattedText.trim().length > 0;
  const isReady = missingFields.length === 0 && warnings.length === 0;
  const spotlight = [
    { label: 'Run', value: draft.values.run_name || 'Run name missing' },
    { label: 'Observer', value: draft.values.observer || 'Observer missing' },
    { label: 'Layers', value: `${parsed.layers.length}` },
    { label: 'Tests', value: `${parsed.stabilityTests.length}` },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel}>
        <Text style={styles.eyebrow}>Formatter Review</Text>
        <Text style={styles.title}>This is the last cleanup stop before you save the profile.</Text>
        <Text style={styles.copy}>
          Review the structure, confirm the key field values, and save only when the draft feels
          trustworthy.
        </Text>

        <View style={[styles.statusBanner, isReady ? styles.statusReady : styles.statusNeedsWork]}>
          <Text style={styles.statusBannerLabel}>{isReady ? 'Ready To Save' : 'Needs Review'}</Text>
          <Text style={styles.statusBannerText}>
            {isReady
              ? 'No missing critical fields and no formatter warnings.'
              : `${missingFields.length} missing critical field${missingFields.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`}
          </Text>
        </View>

        <View style={styles.spotlightRow}>
          {spotlight.map((item) => (
            <View key={item.label} style={styles.spotlightCard}>
              <Text style={styles.spotlightLabel}>{item.label}</Text>
              <Text style={styles.spotlightValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Review Checklist</Text>
          <Text style={styles.reviewLine}>Transcript: {draft.rawNotes.trim() ? 'saved' : 'missing'}</Text>
          <Text style={styles.reviewLine}>
            Required fields: {missingFields.length === 0 ? 'ready' : `${missingFields.length} missing`}
          </Text>
          <Text style={styles.reviewLine}>
            Formatter warnings: {warnings.length === 0 ? 'none' : warnings.length}
          </Text>
          {missingFields.length > 0 ? (
            <View style={styles.chipRow}>
              {missingFields.map((fieldId) => (
                <View key={fieldId} style={styles.missingChip}>
                  <Text style={styles.missingChipText}>{fieldId.replaceAll('_', ' ')}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Saved Profile Snapshot</Text>
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotTitle}>{draft.values.run_name || 'Untitled Run'}</Text>
            <Text style={styles.snapshotSubtitle}>
              {[draft.values.date, draft.values.observer].filter(Boolean).join(' · ') || 'Date and observer will show here'}
            </Text>
            <Text style={styles.snapshotMeta}>
              {[draft.values.aspect, draft.values.slope_angle ? `${draft.values.slope_angle} degrees` : '']
                .filter(Boolean)
                .join(' · ') || 'Aspect and slope will appear here'}
            </Text>
          </View>
        </View>

        {saveMessage ? (
          <View style={styles.savedBanner}>
            <Text style={styles.savedBannerLabel}>Saved To Device</Text>
            <Text style={styles.savedBannerText}>{saveMessage}</Text>
          </View>
        ) : null}

        {isCreatingProfile ? (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerLabel}>Building Profile</Text>
            <Text style={styles.pendingBannerText}>
              Rendering can take around 10 seconds. Please wait while Nivium prepares the plotted profile.
            </Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Formatter Warnings</Text>
          {warnings.length === 0 ? (
            <Text style={styles.warningText}>No formatter warnings. This profile is structurally clean.</Text>
          ) : (
            warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                - {warning}
              </Text>
            ))
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Engine Text Preview</Text>
          <Text style={styles.code}>{formattedText || 'Start filling the draft to generate preview text.'}</Text>
        </View>

        <Pressable
          disabled={!canCreate || isCreatingProfile}
          onPress={() => {
            void (async () => {
              if (isCreatingProfile) {
                return;
              }
              setIsCreatingProfile(true);
              try {
                const created = await createProfileFromDraft(draft.rawNotes.trim() ? 'raw-notes' : 'manual');
                if (created) {
                  if (created.renderError) {
                    if ((created.sourceKind ?? (draft.rawNotes.trim() ? 'raw-notes' : 'manual')) === 'raw-notes') {
                      router.push({
                        pathname: '/raw-notes-pending',
                        params: { profileId: created.id },
                      });
                      return;
                    }
                    setSaveMessage(`${created.title} was saved to Archive, but the plotted renderer failed.`);
                    router.push('/archive');
                    return;
                  }
                  setSaveMessage(`${created.title} is now in Archive. Open Preview to see the saved report layout.`);
                  router.push({
                    pathname: created.documentKind === 'plot' ? '/rendered-profile' : '/profile-preview',
                    params: { profileId: created.id },
                  });
                }
              } finally {
                setIsCreatingProfile(false);
              }
            })();
          }}
          style={[styles.button, !canCreate || isCreatingProfile ? styles.buttonDisabled : null]}>
          {isCreatingProfile ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#FFF8EE" />
              <Text style={styles.buttonText}>Building Profile...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Create Saved Profile And Open Preview</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push('/profile-preview')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Jump To Preview</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2EADB' },
  panel: { flex: 1, padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#395B88', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { marginTop: 10, color: '#173248', fontSize: 34, lineHeight: 38, fontWeight: '800' },
  copy: { marginTop: 12, color: '#55626A', fontSize: 16, lineHeight: 24 },
  statusBanner: {
    marginTop: 18,
    borderRadius: 24,
    padding: 18,
  },
  statusReady: {
    backgroundColor: '#D6E8DE',
  },
  statusNeedsWork: {
    backgroundColor: '#F6DED5',
  },
  statusBannerLabel: {
    color: '#173248',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBannerText: {
    marginTop: 8,
    color: '#173248',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  spotlightRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  spotlightCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#E6D8BE',
  },
  spotlightLabel: {
    color: '#876A46',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spotlightValue: {
    marginTop: 8,
    color: '#173248',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  block: {
    marginTop: 20,
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#FCF8F1',
    gap: 12,
  },
  blockLabel: {
    color: '#876A46',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reviewLine: {
    color: '#1F3443',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  missingChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F4DED5',
  },
  missingChipText: {
    color: '#7E432E',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  snapshotCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#173248',
  },
  snapshotTitle: {
    color: '#FFF8EE',
    fontSize: 22,
    fontWeight: '800',
  },
  snapshotSubtitle: {
    marginTop: 8,
    color: '#D9E4EA',
    fontSize: 14,
    lineHeight: 20,
  },
  snapshotMeta: {
    marginTop: 6,
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  savedBanner: {
    marginTop: 20,
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#D7E5DE',
  },
  savedBannerLabel: {
    color: '#3D6B5A',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  savedBannerText: {
    marginTop: 8,
    color: '#173248',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  pendingBanner: {
    marginTop: 20,
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#D9E4EA',
  },
  pendingBannerLabel: {
    color: '#395B88',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pendingBannerText: {
    marginTop: 8,
    color: '#173248',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  code: {
    color: '#1F3443',
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Courier',
  },
  warningText: {
    color: '#5A3D18',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    marginTop: 24,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#173248',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9DB0BC',
  },
  buttonText: {
    color: '#FFF8EE',
    fontSize: 16,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#173248',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#173248',
    fontSize: 16,
    fontWeight: '700',
  },
});
