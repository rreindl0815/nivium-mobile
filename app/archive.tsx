import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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

import { useAppAccess } from '@/context/app-access-context';
import { useSavedProfiles } from '@/context/saved-profiles-context';
import { getProfileHighlights, parseFormattedProfile } from '@/utils/profile-document';

function buildPreservedDetails(values?: Record<string, string>) {
  if (!values) {
    return [];
  }

  const rows = [
    ['Date', values.date],
    ['Observer', values.observer],
    ['Elevation', values.elevation ? `${values.elevation} m` : ''],
    ['Aspect', values.aspect],
    ['Slope', values.slope_angle ? `${values.slope_angle} deg` : ''],
    ['Total HS', values.total_hs ? `${values.total_hs} cm` : ''],
    ['Surface', values.surface_grain],
    ['Foot Pen', values.foot_pen ? `${values.foot_pen} cm` : ''],
    ['Ski Pen', values.ski_pen ? `${values.ski_pen} cm` : ''],
  ];

  return rows.filter(([, value]) => Boolean(value && value.trim().length > 0));
}

function buildLayerDebugLines(values?: Record<string, string>) {
  if (!values) {
    return [];
  }

  const lines: string[] = [];
  let previousBottom = '';

  for (let index = 1; index <= 12; index += 1) {
    const topField = (values[`layer_${index}_top`] ?? '').trim();
    const bottomField = (values[`layer_${index}_bottom`] ?? '').trim();
    const hardness1 = (values[`layer_${index}_hardness_1`] ?? '').trim();
    const hardness2 = (values[`layer_${index}_hardness_2`] ?? '').trim();
    const grain1 = (values[`layer_${index}_grain_1`] ?? '').trim();
    const grain2 = (values[`layer_${index}_grain_2`] ?? '').trim();
    const size1 = (values[`layer_${index}_size_1`] ?? '').trim();
    const size2 = (values[`layer_${index}_size_2`] ?? '').trim();
    const comment = (values[`layer_${index}_comment`] ?? '').trim();
    const concern = (values[`layer_${index}_concern`] ?? '').trim();
    const legacyLine = (values[`layer_${index}`] ?? '').trim();

    const hasStructuredData = [
      topField,
      bottomField,
      hardness1,
      hardness2,
      grain1,
      grain2,
      size1,
      size2,
      comment,
      concern,
    ].some(Boolean);

    if (!hasStructuredData) {
      if (legacyLine) {
        lines.push(`L${index}: ${legacyLine}`);
      }
      continue;
    }

    const top = topField || previousBottom || (index === 1 ? '0' : '');
    if (bottomField) {
      previousBottom = bottomField;
    }

    const body = [
      top && bottomField ? `${top}-${bottomField}` : [top || '?', bottomField || '?'].join('-'),
      [grain1, grain2].filter(Boolean).join('/'),
      [hardness1, hardness2].filter(Boolean).join('-'),
      [size1, size2].filter(Boolean).join('/'),
      concern === 'yes' ? 'red' : '',
      comment ? `| ${comment}` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    lines.push(`L${index}: ${body || '(empty structured layer)'}`);
  }

  return lines;
}

function needsPlotAttention(profile: {
  documentKind?: 'report' | 'plot';
  renderError?: string;
}) {
  return profile.documentKind !== 'plot' || Boolean(profile.renderError);
}

export default function ArchiveScreen() {
  const router = useRouter();
  const { isPaid } = useAppAccess();
  const { profiles, selectedProfileId, setSelectedProfileId, deleteProfile, reopenProfileForEditing, ensureProfilePdf, isLoaded } = useSavedProfiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const archiveSectionOffsetRef = useRef(0);
  const profileOffsetsRef = useRef<Record<string, number>>({});
  const lastAutoScrollIdRef = useRef<string | null>(null);
  const scrollToProfileCard = useCallback(
    (profileId: string, animated = true) => {
      const profileOffset = profileOffsetsRef.current[profileId];
      if (profileOffset == null) {
        return;
      }
      const targetY = Math.max(
        archiveSectionOffsetRef.current + profileOffset - Math.max(24, viewportHeight * 0.28),
        0
      );
      scrollViewRef.current?.scrollTo({ y: targetY, animated });
    },
    [viewportHeight]
  );
  const searchSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 1) {
      return [];
    }

    const ranked = profiles
      .map((profile) => {
        const haystack = `${profile.title} ${profile.subtitle}`.toLowerCase();
        const startsWithTitle = profile.title.toLowerCase().startsWith(query);
        const startsWithSubtitle = profile.subtitle.toLowerCase().startsWith(query);
        const includes = haystack.includes(query);
        return {
          profile,
          score: startsWithTitle ? 0 : startsWithSubtitle ? 1 : includes ? 2 : 99,
        };
      })
      .filter((entry) => entry.score < 99)
      .sort((a, b) => a.score - b.score || a.profile.title.localeCompare(b.profile.title));

    const seen = new Set<string>();
    return ranked
      .filter(({ profile }) => {
        const key = `${profile.title}__${profile.subtitle}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 5)
      .map(({ profile }) => profile);
  }, [profiles, searchQuery]);
  const filteredProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      if (!query) {
        return true;
      }
      return `${profile.title} ${profile.subtitle}`.toLowerCase().includes(query);
    });
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [profiles, searchQuery]);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const selectedHighlights = selectedProfile ? getProfileHighlights(parseFormattedProfile(selectedProfile.formattedText)) : null;
  const getPreviewRoute = (profile: typeof selectedProfile) => {
    if (!profile) {
      return '/profile-preview';
    }
    if (profile.renderError && profile.sourceKind === 'raw-notes') {
      return '/raw-notes-pending';
    }
    return profile.documentKind === 'plot' ? '/rendered-profile' : '/profile-preview';
  };

  useEffect(() => {
    if (selectedProfileId && openProfileId !== selectedProfileId) {
      setOpenProfileId(selectedProfileId);
      return;
    }
    if (!selectedProfileId && profiles[0]?.id && openProfileId !== profiles[0].id) {
      setOpenProfileId(profiles[0].id);
    }
  }, [openProfileId, profiles, selectedProfileId]);

  useEffect(() => {
    if (!openProfileId || viewportHeight <= 0) {
      return;
    }
    if (lastAutoScrollIdRef.current === openProfileId) {
      return;
    }
    lastAutoScrollIdRef.current = openProfileId;
    const timer = setTimeout(() => {
      scrollToProfileCard(openProfileId);
    }, 120);
    return () => clearTimeout(timer);
  }, [openProfileId, scrollToProfileCard, viewportHeight]);

  useEffect(() => {
    if (!isPaid) {
      router.replace({ pathname: '/upgrade', params: { feature: 'Archive', returnTo: '/archive' } });
    }
  }, [isPaid, router]);

  if (!isPaid) {
    return null;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      onLayout={(event) => {
        setViewportHeight(event.nativeEvent.layout.height);
      }}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.panel} keyboardShouldPersistTaps="handled">
        <ImageBackground source={require('../assets/images/nivium-hero-snow.png')} imageStyle={styles.heroImage} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.heroTitle}>Nivium</Text>
          <View style={styles.heroSubtitleStack}>
            <Text style={styles.heroSubtitle}>Profile Archive</Text>
            <Image source={require('../assets/images/nivium-hero-swish.png')} style={styles.heroSubtitleSwish} resizeMode="stretch" />
          </View>
        </ImageBackground>

        <View style={styles.selectedShell}>
          <View style={styles.cardHighlight} />
          <View style={styles.selectedPanel}>
          <View style={styles.cardAccent} />
          <Text style={styles.sectionLabel}>Current Selection</Text>
          <Text style={styles.selectedTitle}>{selectedProfile?.title || 'No saved profile selected'}</Text>
          <Text style={styles.selectedSubtitle}>
            {selectedProfile?.subtitle || 'Create a saved profile from Review to start your archive.'}
          </Text>
          <Text style={styles.selectedMeta}>
            {selectedProfile
              ? `${selectedHighlights?.layerCount ?? 0} layers · ${selectedHighlights?.stabilityCount ?? 0} tests · ${
                  selectedProfile.renderError ? 'Plot failed' : selectedProfile.pdfUri ? 'PDF saved' : 'PDF pending'
                }`
              : 'Archive actions will use the selected profile.'}
          </Text>
          <View style={styles.selectedActions}>
            <View style={styles.actionRow}>
              <Pressable
                disabled={!selectedProfile}
                onPress={() =>
                  router.push({
                    pathname: getPreviewRoute(selectedProfile),
                    params: selectedProfile
                      ? selectedProfile.documentKind === 'plot'
                        ? { profileId: selectedProfile.id, viewer: '1' }
                        : { profileId: selectedProfile.id }
                      : undefined,
                  })
                }
                style={[styles.primaryActionShell, styles.actionWide, !selectedProfile ? styles.actionDisabled : null]}>
                <View style={styles.primaryActionHighlight} />
                <View style={styles.primaryActionFrame}>
                <View style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>Open Preview</Text>
                </View>
                </View>
              </Pressable>
              <Pressable
                disabled={!selectedProfile}
                onPress={() => router.push('/print')}
                style={[styles.secondaryActionShell, styles.actionNarrow, !selectedProfile ? styles.actionDisabledOutline : null]}>
                <View style={styles.secondaryActionFrame}>
                <View style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Print</Text>
                </View>
                </View>
              </Pressable>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                disabled={!selectedProfile}
                onPress={() => router.push('/share')}
                style={[styles.secondaryActionShell, styles.actionNarrow, !selectedProfile ? styles.actionDisabledOutline : null]}>
                <View style={styles.secondaryActionFrame}>
                <View style={styles.secondaryAction}>
                <Text style={styles.secondaryActionText}>Share</Text>
                </View>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/')} style={[styles.primaryActionShell, styles.actionWide]}>
                <View style={styles.primaryActionHighlight} />
                <View style={styles.primaryActionFrame}>
                <View style={styles.primaryAction}>
                <Text style={styles.primaryActionText}>Home</Text>
                </View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
        </View>

        <View
          style={styles.archiveShell}
          onLayout={(event) => {
            archiveSectionOffsetRef.current = event.nativeEvent.layout.y;
          }}>
          <View style={styles.cardHighlight} />
          <View style={styles.archivePanel}>
          <View style={styles.cardAccent} />
          <Text style={styles.sectionLabel}>Saved Profiles</Text>
          <View style={styles.searchBlock}>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by run name or location"
              placeholderTextColor="#546878"
              style={styles.searchInput}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({
                    y: Math.max(archiveSectionOffsetRef.current - 16, 0),
                    animated: true,
                  });
                }, 120);
              }}
            />
            {searchSuggestions.length > 0 ? (
              <View style={styles.suggestionsPanel}>
                {searchSuggestions.map((profile, index) => (
                  <Pressable
                    key={`${profile.id}-suggestion`}
                    onPress={() => {
                      setSearchQuery(profile.title);
                      setSelectedProfileId(profile.id);
                      setOpenProfileId(profile.id);
                      setTimeout(() => {
                        scrollToProfileCard(profile.id);
                      }, 160);
                    }}
                    style={[styles.suggestionRow, index === 0 ? styles.suggestionRowFirst : null]}>
                    <Text style={styles.suggestionTitle}>{profile.title}</Text>
                    <Text style={styles.suggestionSubtitle}>{profile.subtitle}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          {!isLoaded ? <Text style={styles.emptyText}>Loading archive...</Text> : null}
          {isLoaded && filteredProfiles.length === 0 ? (
            <Text style={styles.emptyText}>No saved profiles yet. Create one from the review screen.</Text>
          ) : null}
          {filteredProfiles.map((profile) => {
            const highlights = getProfileHighlights(parseFormattedProfile(profile.formattedText));
            const preservedDetails = buildPreservedDetails(profile.sourceValues);
            const layerDebugLines = buildLayerDebugLines(profile.sourceValues);
            const showRenderDebug = needsPlotAttention(profile);
            const isSelected = selectedProfileId === profile.id || (!selectedProfileId && profiles[0]?.id === profile.id);
            const isOpen = openProfileId === profile.id;
            return (
              <View
                key={profile.id}
                style={[styles.profileCard, isSelected ? styles.profileCardSelected : null]}
                onLayout={(event) => {
                  profileOffsetsRef.current[profile.id] = event.nativeEvent.layout.y;
                }}>
                <Pressable
                  onPress={() => {
                    setSelectedProfileId(profile.id);
                    setOpenProfileId((current) => {
                      const next = current === profile.id ? null : profile.id;
                      if (next) {
                        lastAutoScrollIdRef.current = null;
                        setTimeout(() => {
                          scrollToProfileCard(profile.id);
                        }, 140);
                      }
                      return next;
                    });
                  }}>
                  <View style={styles.profileHeader}>
                    <View style={styles.profileTitleWrap}>
                      <Text style={styles.profileTitle}>{profile.title}</Text>
                      <Text style={styles.profileSubtitle}>{profile.subtitle}</Text>
                    </View>
                    <View style={[styles.selectionBadge, isSelected ? styles.selectionBadgeActive : null]}>
                      <Text style={[styles.selectionBadgeText, isSelected ? styles.selectionBadgeTextActive : null]}>
                        {isSelected ? 'Selected' : 'Tap To Select'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.profileQuickMeta}>
                    {highlights.layerCount} layers · {highlights.stabilityCount} tests · {profile.renderError ? 'plot failed' : profile.documentKind === 'plot' ? 'plot saved' : profile.pdfUri ? 'report only' : 'draft only'}
                  </Text>
                  <Text style={styles.profileDate}>Saved {new Date(profile.createdAt).toLocaleString()}</Text>
                  {showRenderDebug ? (
                    <Text style={styles.renderErrorText}>
                      {profile.renderError
                        ? `Renderer issue: ${profile.renderError}`
                        : 'This profile is using the older report output and can be upgraded to a plotted render.'}
                    </Text>
                  ) : null}
                  {profile.previewImageUri ? (
                    <Image source={{ uri: profile.previewImageUri }} style={styles.profileThumbnail} resizeMode="contain" />
                  ) : null}
                </Pressable>
                {isOpen ? (
                  <>
                    <View style={styles.profileActions}>
                      {showRenderDebug ? (
                        <Pressable
                          onPress={() => {
                            void (async () => {
                              setSelectedProfileId(profile.id);
                              const renderResult = await ensureProfilePdf(profile.id);
                              if (renderResult.uri) {
                                router.push({
                                  pathname: '/rendered-profile',
                                  params: { profileId: profile.id },
                                });
                                return;
                              }
                              Alert.alert(
                                profile.renderError ? 'Plot Render Failed' : 'Plot Upgrade Failed',
                                renderResult.error ||
                                  'The renderer still did not complete. Your profile data is safe in Archive and can be edited or retried later.'
                              );
                            })();
                          }}
                          style={styles.inlineAction}>
                          <Text style={styles.inlineActionText}>Retry Render</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          void (async () => {
                            setSelectedProfileId(profile.id);
                            const editKind = await reopenProfileForEditing(profile.id);
                            if (editKind === 'raw-notes') {
                              router.push('/voice-review');
                              return;
                            }
                            router.push({
                              pathname: '/manual-entry',
                              params: { editProfileId: profile.id },
                            });
                          })();
                        }}
                        style={styles.inlineAction}>
                        <Text style={styles.inlineActionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedProfileId(profile.id);
                          if (showRenderDebug && profile.documentKind !== 'plot' && profile.sourceKind !== 'raw-notes') {
                            Alert.alert(
                              'Plot Preview Unavailable',
                              'This profile does not have a plotted preview yet. Use the render button first, or edit the entry data.'
                            );
                            return;
                          }
                          router.push({
                            pathname: getPreviewRoute(profile),
                            params:
                              profile.documentKind === 'plot'
                                ? { profileId: profile.id, viewer: '1' }
                                : { profileId: profile.id },
                          });
                        }}
                        style={styles.inlineAction}>
                        <Text style={styles.inlineActionText}>Preview</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedProfileId(profile.id);
                          router.push('/share');
                        }}
                        style={styles.inlineAction}>
                        <Text style={styles.inlineActionText}>Share</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedProfileId(profile.id);
                          router.push('/print');
                        }}
                        style={styles.inlineAction}>
                        <Text style={styles.inlineActionText}>Print</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Alert.alert('Delete Saved Profile', `Delete "${profile.title}" from this device archive?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: () => {
                                void deleteProfile(profile.id);
                              },
                            },
                          ]);
                        }}
                        style={styles.inlineDanger}>
                        <Text style={styles.inlineDangerText}>Delete</Text>
                      </Pressable>
                    </View>
                    <View style={styles.metricsRow}>
                      <View style={styles.metricChip}>
                        <Text style={styles.metricValue}>{highlights.layerCount}</Text>
                        <Text style={styles.metricLabel}>layers</Text>
                      </View>
                      <View style={styles.metricChip}>
                        <Text style={styles.metricValue}>{highlights.redLayerCount}</Text>
                        <Text style={styles.metricLabel}>red</Text>
                      </View>
                      <View style={styles.metricChip}>
                        <Text style={styles.metricValue}>{highlights.stabilityCount}</Text>
                        <Text style={styles.metricLabel}>tests</Text>
                      </View>
                    </View>
                    {preservedDetails.length > 0 ? (
                      <View style={styles.detailsPanel}>
                        <Text style={styles.detailsPanelLabel}>Saved Entry Data</Text>
                        <View style={styles.detailsGrid}>
                          {preservedDetails.map(([label, value]) => (
                            <View key={`${profile.id}-${label}`} style={styles.detailChip}>
                              <Text style={styles.detailLabel}>{label}</Text>
                              <Text style={styles.detailValue}>{value}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {showRenderDebug ? (
                      <View style={styles.engineTextPanel}>
                        <Text style={styles.detailsPanelLabel}>Engine Text Debug</Text>
                        <Text style={styles.engineTextValue}>{profile.formattedText || 'No engine text saved.'}</Text>
                        {layerDebugLines.length > 0 ? (
                          <>
                            <Text style={[styles.detailsPanelLabel, styles.engineTextSubLabel]}>Layer Builder Snapshot</Text>
                            <Text style={styles.engineTextValue}>{layerDebugLines.join('\n')}</Text>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
        </View>

        <Pressable onPress={() => router.push('/')} style={({ pressed }) => [styles.homeShell, pressed ? styles.pressed : null]}>
          <View style={styles.homeHighlight} />
          <View style={styles.homeButtonFrame}>
            <View style={styles.homeButton}>
              <Text style={styles.homeButtonText}>Home</Text>
            </View>
          </View>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#20384D' },
  panel: { padding: 20, paddingTop: 72, paddingBottom: 40, gap: 16 },
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
  heroImage: {
    borderRadius: 8,
  },
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
    width: 196,
    height: 24,
    opacity: 0.96,
    alignSelf: 'flex-end',
  },
  selectedShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  archiveShell: {
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
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  cardAccent: {
    width: 68,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#20384D',
    marginBottom: 16,
  },
  selectedPanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
  },
  sectionLabel: {
    color: '#B7CCD8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedTitle: {
    marginTop: 8,
    color: '#FFF8EE',
    fontSize: 24,
    fontWeight: '800',
  },
  selectedSubtitle: {
    marginTop: 8,
    color: '#D9E4EA',
    fontSize: 15,
    lineHeight: 22,
  },
  selectedMeta: {
    marginTop: 8,
    color: '#AFC3CE',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedActions: {
    marginTop: 18,
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionWide: {
    flex: 1.6,
  },
  actionNarrow: {
    flex: 1,
  },
  primaryActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  primaryActionHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  primaryActionFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#173248',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.5)',
  },
  primaryAction: {
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3B627D',
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryActionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  secondaryActionFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.3)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.44)',
  },
  secondaryAction: {
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#A9B8C4',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#173248',
    fontSize: 15,
    fontWeight: '700',
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionDisabledOutline: {
    opacity: 0.45,
  },
  archivePanel: {
    borderRadius: 5,
    padding: 20,
    backgroundColor: '#173248',
    borderWidth: 2,
    borderColor: '#173248',
    gap: 12,
  },
  searchBlock: {
    gap: 10,
  },
  searchInput: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#D7E0E8',
    color: '#173248',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#31495C',
  },
  suggestionsPanel: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#31495C',
    backgroundColor: '#D7E0E8',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#9EB0BD',
    gap: 4,
  },
  suggestionRowFirst: {
    borderTopWidth: 0,
  },
  suggestionTitle: {
    color: '#173248',
    fontSize: 14,
    fontWeight: '800',
  },
  suggestionSubtitle: {
    color: '#4E6272',
    fontSize: 12,
    lineHeight: 16,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  sortChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#A9B8C4',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.24)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.38)',
  },
  sortChipActive: {
    backgroundColor: '#30516A',
  },
  sortChipText: {
    color: '#173248',
    fontSize: 13,
    fontWeight: '800',
  },
  sortChipTextActive: {
    color: '#FFF8EE',
  },
  emptyText: {
    color: '#1F3443',
    fontSize: 16,
    lineHeight: 22,
  },
  profileCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#D7E0E8',
    borderWidth: 1,
    borderColor: '#31495C',
  },
  profileCardSelected: {
    backgroundColor: '#A9B8C4',
  },
  profileHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  profileTitleWrap: {
    flex: 1,
  },
  profileTitle: { color: '#173248', fontSize: 18, fontWeight: '800' },
  profileSubtitle: { marginTop: 4, color: '#5D6971', fontSize: 14, lineHeight: 20 },
  profileQuickMeta: {
    marginTop: 12,
    color: '#30516A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  selectionBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#C6D3DC',
  },
  selectionBadgeActive: {
    backgroundColor: '#173248',
  },
  selectionBadgeText: {
    color: '#4A6173',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectionBadgeTextActive: {
    color: '#FFF8EE',
  },
  metricsRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricChip: {
    minWidth: '23%',
    flexGrow: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#D7E0E8',
  },
  metricValue: {
    color: '#173248',
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    marginTop: 2,
    color: '#4E6272',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  detailsPanel: {
    marginTop: 14,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#D7E0E8',
  },
  detailsPanelLabel: {
    color: '#173248',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  detailsGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F3F6F8',
  },
  detailLabel: {
    color: '#5A6E7C',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    marginTop: 4,
    color: '#173248',
    fontSize: 13,
    fontWeight: '700',
  },
  engineTextPanel: {
    marginTop: 14,
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#F3F6F8',
  },
  engineTextValue: {
    marginTop: 10,
    color: '#173248',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Courier',
  },
  engineTextSubLabel: {
    marginTop: 14,
  },
  profileDate: { marginTop: 12, color: '#4E6272', fontSize: 12, fontWeight: '600' },
  renderErrorText: {
    marginTop: 8,
    color: '#7A1D29',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  profileThumbnail: {
    marginTop: 12,
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#F3F6F8',
    borderWidth: 1,
    borderColor: '#8EA2B0',
  },
  profileActions: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inlineAction: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#A9B8C4',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.26)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.16)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.24)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.38)',
  },
  inlineActionText: {
    color: '#173248',
    fontSize: 13,
    fontWeight: '800',
  },
  inlineDanger: {
    marginLeft: 'auto',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#D9AAB0',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.1)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(82,8,18,0.34)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(82,8,18,0.5)',
  },
  inlineDangerText: {
    color: '#7A1D29',
    fontSize: 13,
    fontWeight: '700',
  },
  homeShell: {
    marginTop: 8,
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  homeHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  homeButtonFrame: {
    borderRadius: 5,
    padding: 2,
    backgroundColor: '#20384D',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(7,20,36,0.38)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(7,20,36,0.52)',
  },
  homeButton: {
    borderRadius: 3,
    paddingVertical: 16,
    paddingHorizontal: 18,
    backgroundColor: '#94A8B8',
    alignItems: 'center',
  },
  homeButtonText: { color: '#173248', fontSize: 18, fontWeight: '800' },
  pressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
  },
});
