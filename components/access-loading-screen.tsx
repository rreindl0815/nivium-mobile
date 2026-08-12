import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export function AccessLoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ActivityIndicator color="#FFF8EE" size="large" />
        <Text style={styles.title}>Checking your access</Text>
        <Text style={styles.copy}>Nivium is reconnecting your account and subscription.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#20384D',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  title: {
    color: '#FFF8EE',
    fontSize: 20,
    fontWeight: '700',
  },
  copy: {
    color: '#D8E4EC',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
