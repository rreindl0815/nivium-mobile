import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSavedProfiles } from '@/context/saved-profiles-context';
import { useParsedProfile } from '@/hooks/use-parsed-profile';
import { getMetadataValue, getProfileHighlights, parseLayers } from '@/utils/profile-document';
import { getRendererAvailability } from '@/utils/profile-renderer';

export default function ProfilePreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileId?: string }>();
  const { profiles, selectedProfile } = useSavedProfiles();
  const routeProfileId = Array.isArray(params.profileId) ? params.profileId[0] : params.profileId;
  const explicitProfile = routeProfileId ? profiles.find((profile) => profile.id === routeProfileId) ?? null : null;
  const activeProfile = routeProfileId ? explicitProfile : selectedProfile;
  const parsed = useParsedProfile(activeProfile?.formattedText);
  const rendererAvailability = getRendererAvailability();
  const highlights = getProfileHighlights(parsed);
  const layers = parseLayers(parsed);
  const maxDepth = Math.max(
    Number.parseFloat((highlights.totalHs || '').replace(/[^\d.]/g, '')) || 0,
    ...layers.map((layer) => layer.bottom),
    1
  );
  const locationLine = [highlights.aspect, highlights.slopeAngle].filter(Boolean).join(' · ');
  const heroSubline =
    [highlights.date, highlights.observer].filter(Boolean).join(' · ') ||
    activeProfile?.subtitle ||
    'Unsaved draft';
  const summaryCards = [
    {
      label: 'Layers',
      value: `${highlights.layerCount}`,
      copy: `${highlights.redLayerCount} marked red`,
    },
    {
      label: 'Temps',
      value: `${highlights.temperatureCount}`,
      copy: 'temperature samples',
    },
    {
      label: 'Tests',
      value: `${highlights.stabilityCount}`,
      copy: 'stability entries',
    },
    {
      label: 'Surface',
      value: highlights.surfaceGrain || '—',
      copy: highlights.totalHs || 'Total Hs missing',
    },
  ];
  const overview = [
    ['Run Name', activeProfile?.title || 'Current Draft Preview'],
    ['Observer', highlights.observer || getMetadataValue(parsed, 'Observer') || 'Missing'],
    ['Date', highlights.date || getMetadataValue(parsed, 'Date') || 'Missing'],
    ['Aspect', highlights.aspect || 'Missing'],
    ['Slope', highlights.slopeAngle || 'Missing'],
    ['Snowpack', highlights.totalHs || 'Missing'],
  ] as const;
  const noteText = parsed.notes.join('\n') || activeProfile?.rawNotes || 'No extra notes.';

  if (routeProfileId && !explicitProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>Profile Preview</Text>
          <Text style={styles.title}>Opening saved profile...</Text>
          <Text style={styles.copy}>Nivium is loading the exact saved card you selected.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel}>
        <Text style={styles.eyebrow}>Profile Preview</Text>
        <Text style={styles.title}>This is the phone-ready version of the finished profile.</Text>
        <Text style={styles.copy}>
          Review the saved profile the way a forecaster or recorder would actually scan it before
          sharing or printing.
        </Text>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>Current Output</Text>
          <Text style={styles.noticeText}>
            {activeProfile?.documentKind === 'plot'
              ? 'This saved profile is using the plotted Nivium renderer output.'
              : `${rendererAvailability.summary} The app is currently using the polished report PDF fallback while the plotted runtime is wired in.`}
          </Text>
        </View>
        <View style={styles.topActionRow}>
          <Pressable
            onPress={() => {
              if (!activeProfile?.pdfUri) {
                return;
              }
              const pdfUri = activeProfile.pdfUri;
              void (async () => {
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(pdfUri);
                  return;
                }

                Alert.alert('PDF Ready', 'The plotted PDF was created, but this device cannot open the native share sheet here.');
              })();
            }}
            style={[styles.topSecondaryButton, !activeProfile?.pdfUri ? styles.topButtonDisabled : null]}
            disabled={!activeProfile?.pdfUri}>
            <Text style={styles.topSecondaryButtonText}>Open PDF</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/archive')} style={styles.topPrimaryButton}>
            <Text style={styles.topPrimaryButtonText}>Open Archive</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/share')} style={styles.topSecondaryButton}>
            <Text style={styles.topSecondaryButtonText}>Share</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/print')} style={styles.topSecondaryButton}>
            <Text style={styles.topSecondaryButtonText}>Print</Text>
          </Pressable>
        </View>
        <View style={styles.previewCard}>
          <View style={styles.paper}>
            <View style={styles.paperHero}>
              <Text style={styles.paperEyebrow}>
                {activeProfile?.documentKind === 'plot' ? 'Nivium Plot Preview' : 'Nivium Report Preview'}
              </Text>
              <Text style={styles.paperTitle}>{activeProfile?.title || 'Current Draft Preview'}</Text>
              <Text style={styles.paperSubtitle}>{heroSubline}</Text>
              <Text style={styles.paperSubmeta}>{locationLine || 'Aspect and slope will appear here once captured.'}</Text>
            </View>

            <View style={styles.metricsRow}>
              {summaryCards.map((card) => (
                <View key={card.label} style={styles.metricCard}>
                  <Text style={styles.metricLabel}>{card.label}</Text>
                  <Text style={styles.metricValue}>{card.value}</Text>
                  <Text style={styles.metricCopy}>{card.copy}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Overview</Text>
              <View style={styles.metaGrid}>
                {overview.map(([label, value]) => (
                  <View key={label} style={styles.metaCard}>
                    <Text style={styles.metaLabel}>{label}</Text>
                    <Text style={styles.metaValue}>{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Snow Profile Chart</Text>
              <View style={styles.chartWrap}>
                <View style={styles.chartScale}>
                  {buildDepthTicks(maxDepth).map((tick) => (
                    <View key={tick.label} style={[styles.chartTick, { top: `${tick.position}%` }]}>
                      <Text style={styles.chartTickText}>{tick.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.chartColumn}>
                  {layers.length === 0 ? (
                    <Text style={styles.itemText}>No parsed layers yet.</Text>
                  ) : (
                    layers.map((layer, index) => (
                      <View
                        key={`${layer.top}-${layer.bottom}-${index}`}
                        style={[
                          styles.chartLayer,
                          {
                            minHeight: Math.max(((layer.bottom - layer.top) / maxDepth) * 280, 22),
                          },
                          layer.isRed ? styles.chartLayerRed : index % 2 === 0 ? styles.chartLayerEven : styles.chartLayerOdd,
                        ]}>
                        <Text style={[styles.chartDepth, layer.isRed ? styles.chartTextRed : null]}>
                          {layer.top}-{layer.bottom}
                        </Text>
                        <Text style={[styles.chartLine, layer.isRed ? styles.chartTextRed : null]}>
                          {[layer.grain, layer.hardness, layer.size].filter(Boolean).join(' ') || layer.line}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>

            <View style={styles.columns}>
              <View style={styles.column}>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Snowpack Layers</Text>
                  {parsed.layers.length === 0 ? (
                    <Text style={styles.itemText}>No layers yet.</Text>
                  ) : (
                    parsed.layers.map((line) => (
                      <View key={line} style={styles.layerRow}>
                        <View style={[styles.layerMarker, /\bred\b/i.test(line) ? styles.layerMarkerRed : null]} />
                        <Text style={styles.itemText}>{line}</Text>
                      </View>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Field Notes</Text>
                  <Text style={styles.notesText}>{noteText}</Text>
                </View>
              </View>

              <View style={styles.column}>
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Temperature Profile</Text>
                  {parsed.temperatures.length === 0 ? (
                    <Text style={styles.itemText}>No temperatures yet.</Text>
                  ) : (
                    parsed.temperatures.map((line) => (
                      <Text key={line} style={styles.itemText}>
                        {line}
                      </Text>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Stability Tests</Text>
                  {parsed.stabilityTests.length === 0 ? (
                    <Text style={styles.itemText}>No tests yet.</Text>
                  ) : (
                    parsed.stabilityTests.map((line) => (
                      <Text key={line} style={styles.itemText}>
                        {line}
                      </Text>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Saved Profile</Text>
                  <Text style={styles.itemText}>
                    {activeProfile ? `Showing saved profile: ${activeProfile.title}` : 'Showing current draft preview'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.actionRow}>
          <Pressable onPress={() => router.push('/archive')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Archive</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/share')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Share</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/print')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Print</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#20384D' },
  panel: { padding: 24, justifyContent: 'center', paddingTop: 28, paddingBottom: 40 },
  eyebrow: { color: '#D1A062', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { marginTop: 10, color: '#F7F2EA', fontSize: 34, lineHeight: 38, fontWeight: '800' },
  copy: { marginTop: 12, color: '#C3D0DA', fontSize: 16, lineHeight: 24 },
  noticeCard: {
    marginTop: 18,
    borderRadius: 10,
    padding: 16,
    backgroundColor: '#BECEDA',
    borderWidth: 3,
    borderColor: '#06080B',
  },
  noticeLabel: {
    color: '#876A46',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  noticeText: {
    marginTop: 8,
    color: '#173248',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  topActionRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  topPrimaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#173248',
    borderWidth: 3,
    borderColor: '#06080B',
  },
  topButtonDisabled: {
    opacity: 0.45,
  },
  topPrimaryButtonText: {
    color: '#FFF8EE',
    fontSize: 14,
    fontWeight: '800',
  },
  topSecondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 3,
    borderColor: '#06080B',
    backgroundColor: '#BECEDA',
  },
  topSecondaryButtonText: {
    color: '#173248',
    fontSize: 14,
    fontWeight: '700',
  },
  previewCard: {
    marginTop: 28,
    borderRadius: 10,
    padding: 18,
    backgroundColor: '#94A8B8',
    borderWidth: 3,
    borderColor: '#06080B',
  },
  paper: {
    minHeight: 360,
    borderRadius: 10,
    padding: 18,
    backgroundColor: '#D7E0E8',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  paperHero: {
    borderRadius: 8,
    padding: 18,
    backgroundColor: '#173248',
  },
  paperEyebrow: {
    color: '#B9CCD7',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  paperTitle: {
    marginTop: 8,
    color: '#FFF8EE',
    fontSize: 24,
    fontWeight: '800',
  },
  paperSubtitle: {
    marginTop: 8,
    color: '#E1E9ED',
    fontSize: 14,
    lineHeight: 20,
  },
  paperSubmeta: {
    marginTop: 6,
    color: '#B4C9D4',
    fontSize: 13,
    lineHeight: 18,
  },
  metricsRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#A9B8C4',
  },
  metricLabel: {
    color: '#7A603B',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: {
    marginTop: 6,
    color: '#173248',
    fontSize: 24,
    fontWeight: '800',
  },
  metricCopy: {
    marginTop: 4,
    color: '#5B5145',
    fontSize: 12,
    lineHeight: 16,
  },
  section: {
    marginTop: 10,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#C7D3DD',
  },
  chartWrap: {
    flexDirection: 'row',
    gap: 12,
  },
  chartScale: {
    width: 56,
    height: 280,
    position: 'relative',
  },
  chartTick: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: '#D7C5A8',
  },
  chartTickText: {
    marginTop: -8,
    color: '#7B694E',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#F3EEE4',
    alignSelf: 'flex-start',
    paddingRight: 4,
  },
  chartColumn: {
    flex: 1,
    height: 280,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#31495C',
    backgroundColor: '#E7EDF1',
  },
  chartLayer: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92, 75, 48, 0.12)',
    justifyContent: 'center',
  },
  chartLayerEven: {
    backgroundColor: '#BECEDA',
  },
  chartLayerOdd: {
    backgroundColor: '#D7E0E8',
  },
  chartLayerRed: {
    backgroundColor: '#B95339',
  },
  chartDepth: {
    color: '#173248',
    fontSize: 11,
    fontWeight: '800',
  },
  chartLine: {
    marginTop: 4,
    color: '#173248',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  chartTextRed: {
    color: '#FFF8EE',
  },
  sectionLabel: {
    color: '#876A46',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  itemText: {
    color: '#1F3443',
    fontSize: 14,
    lineHeight: 22,
  },
  columns: {
    marginTop: 6,
    gap: 10,
  },
  column: {
    gap: 10,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#E7EDF1',
  },
  metaLabel: {
    color: '#8A6A46',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  metaValue: {
    marginTop: 6,
    color: '#173248',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  layerMarker: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: '#9AAB84',
  },
  layerMarkerRed: {
    backgroundColor: '#A94C2A',
  },
  notesText: {
    color: '#1F3443',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Courier',
  },
  actionRow: {
    marginTop: 20,
    gap: 10,
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#173248',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#06080B',
  },
  primaryButtonText: {
    color: '#FFF8EE',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderWidth: 3,
    borderColor: '#06080B',
    backgroundColor: '#BECEDA',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#173248',
    fontSize: 16,
    fontWeight: '700',
  },
});

function buildDepthTicks(maxDepth: number) {
  const step = maxDepth <= 120 ? 20 : 50;
  const ticks = [];
  for (let depth = 0; depth <= maxDepth; depth += step) {
    ticks.push({
      label: `${depth} cm`,
      position: (depth / maxDepth) * 100,
    });
  }
  if (ticks.at(-1)?.label !== `${Math.round(maxDepth)} cm`) {
    ticks.push({
      label: `${Math.round(maxDepth)} cm`,
      position: 100,
    });
  }
  return ticks;
}
