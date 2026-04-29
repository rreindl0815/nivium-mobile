import { useRouter } from 'expo-router';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fieldCardSections } from '@/data/field-card';

const guideLines: Record<string, string[]> = {
  metadata: [
    'Start with: Date, Time, Run Name, Observer, Organization.',
    'Then say: Elevation, Aspect, Slope Angle, Lat / Long.',
    'Finish weather/snow: Air Temperature, Sky, Precip, Wind, Total Hs, Surface Grain, Foot Pen, Ski Pen.',
    'Say one field per phrase. If you correct a field, restate the full field clearly.',
  ],
  layers: [
    'Use this sequence: "First layer from X to Y ...".',
    'Then continue: "Next layer down to Z ...". Repeat until complete.',
    'For each layer, say: depth range, grain, hardness, then grain size.',
    'If needed, add "this layer red" and any short layer comment.',
  ],
  temperatures: [
    'Start at surface, then move downward by depth.',
    'Say one line at a time: "-10 surface", "-6 40 cm", "-2 100 cm".',
    'Keep depths increasing downward for the cleanest result.',
  ],
  tests: [
    'Say one complete stability test per line.',
    'Include test code/details and depth: "ECTP14 at 41 cm", "PST 40/100 ARR at 46 cm".',
    'Say notes only after all tests are done.',
  ],
};

export default function FieldcardGuideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.panel} showsVerticalScrollIndicator={false}>
        <View style={styles.headerShell}>
          <View style={styles.headerHighlight} />
          <View style={styles.headerCard}>
            <View style={styles.cardAccent} />
            <Text style={styles.eyebrow}>Field Card</Text>
            <Text style={styles.title}>Follow Field Card for Voice Notes</Text>
            <Text style={styles.copy}>Read this top to bottom while recording so the formatter hears a clean sequence.</Text>
          </View>
        </View>

        {fieldCardSections.map((section) => (
          <View key={section.id} style={styles.sectionShell}>
            <View style={styles.sectionHighlight} />
            <View style={styles.sectionCard}>
              <View style={styles.cardAccent} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionDescription}>{section.description}</Text>
              {guideLines[section.id]?.map((line, index) => (
                <Text key={`${section.id}-bullet-${index}`} style={styles.bullet}>
                  {`• ${line}`}
                </Text>
              ))}
              {section.id === 'metadata'
                ? section.fields.map((field) => (
                    <Text key={field.id} style={styles.fieldLine}>
                      {field.label}
                    </Text>
                  ))
                : null}
            </View>
          </View>
        ))}

        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backShell, pressed ? styles.pressed : null]}>
          <View style={styles.headerHighlight} />
          <View style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to Voice Notes</Text>
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
  panel: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 18,
  },
  headerShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 14,
  },
  headerHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  headerCard: {
    borderRadius: 5,
    padding: 18,
    backgroundColor: '#BECEDA',
  },
  cardAccent: {
    width: 48,
    height: 6,
    borderRadius: 999,
    marginBottom: 16,
    backgroundColor: '#20384D',
  },
  eyebrow: {
    color: '#876A46',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: '#1F3443',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
  },
  copy: {
    marginTop: 10,
    color: '#55626A',
    fontSize: 16,
    lineHeight: 23,
  },
  sectionShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
  },
  sectionHighlight: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    height: 8,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  sectionCard: {
    borderRadius: 5,
    padding: 18,
    backgroundColor: '#BECEDA',
  },
  sectionTitle: {
    color: '#1F3443',
    fontSize: 22,
    fontWeight: '800',
  },
  sectionDescription: {
    marginTop: 6,
    color: '#55626A',
    fontSize: 15,
    lineHeight: 22,
  },
  bullet: {
    marginTop: 10,
    color: '#1F3443',
    fontSize: 15,
    lineHeight: 22,
  },
  fieldLine: {
    marginTop: 8,
    color: '#20384D',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  backShell: {
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#06080B',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 18,
    elevation: 14,
  },
  backButton: {
    borderRadius: 5,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: '#173248',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFF8EE',
    fontSize: 18,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
  },
});
