import { Pressable, StyleSheet, Text, View } from 'react-native';

type AccordionSectionProps = {
  title: string;
  description: string;
  accent: string;
  isOpen: boolean;
  onToggle: () => void;
  compact?: boolean;
  children: React.ReactNode;
};

export function AccordionSection({
  title,
  description,
  accent,
  isOpen,
  onToggle,
  compact = false,
  children,
}: AccordionSectionProps) {
  return (
    <View style={styles.shell}>
      <Pressable onPress={onToggle} style={[styles.header, compact ? styles.headerCompact : null]}>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
        <View style={styles.headerText}>
          <Text style={[styles.title, compact ? styles.titleCompact : null]}>{title}</Text>
          <Text style={[styles.description, compact ? styles.descriptionCompact : null]}>
            {description}
          </Text>
        </View>
        <Text style={[styles.chevron, compact ? styles.chevronCompact : null]}>{isOpen ? '−' : '+'}</Text>
      </Pressable>
      {isOpen ? <View style={[styles.content, compact ? styles.contentCompact : null]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 10,
    backgroundColor: '#06080B',
    padding: 3,
    overflow: 'hidden',
    shadowColor: '#091827',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 7,
    padding: 15,
    gap: 12,
    backgroundColor: '#BECEDA',
  },
  headerCompact: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  accentBar: {
    width: 10,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#20384D',
    fontSize: 18,
    fontWeight: '800',
  },
  titleCompact: {
    fontSize: 17,
  },
  description: {
    color: '#4E6272',
    fontSize: 13,
    lineHeight: 18,
  },
  descriptionCompact: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  chevron: {
    color: '#20384D',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  chevronCompact: {
    fontSize: 21,
    lineHeight: 21,
  },
  content: {
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 14,
    backgroundColor: '#BECEDA',
  },
  contentCompact: {
    paddingHorizontal: 17,
    paddingBottom: 16,
    gap: 13,
  },
});
