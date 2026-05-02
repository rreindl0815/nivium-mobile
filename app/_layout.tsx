import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppAccessProvider } from '@/context/app-access-context';
import { ProfileDraftProvider } from '@/context/profile-draft-context';
import { SavedProfilesProvider } from '@/context/saved-profiles-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppAccessProvider>
        <ProfileDraftProvider>
          <SavedProfilesProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </SavedProfilesProvider>
        </ProfileDraftProvider>
      </AppAccessProvider>
    </ThemeProvider>
  );
}
