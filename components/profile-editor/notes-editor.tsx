import { StyleSheet, Text, TextInput, View } from 'react-native';

export function NotesEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.groupCard}>
      <Text style={styles.groupTitle}>Notes</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Add any extra notes to preserve"
        placeholderTextColor="#7B8E9D"
        multiline
        textAlignVertical="top"
        style={[styles.fieldInput, styles.notesInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  groupCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#E8EFF3',
    gap: 12,
  },
  groupTitle: {
    color: '#20384D',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  fieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8FA5B6',
    backgroundColor: '#F6FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#173248',
    fontSize: 16,
    lineHeight: 20,
  },
  notesInput: {
    minHeight: 124,
    paddingTop: 12,
  },
});
