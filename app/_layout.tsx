import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppAccessProvider } from '@/context/app-access-context';
import { ProfileDraftProvider } from '@/context/profile-draft-context';
import { SavedProfilesProvider } from '@/context/saved-profiles-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppAccessProvider>
        <ProfileDraftProvider>
          <SavedProfilesProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#F2EADB' },
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="record-notes" />
              <Stack.Screen name="manual-entry" />
              <Stack.Screen name="fieldcard-guide" />
              <Stack.Screen name="dictation" />
              <Stack.Screen name="field-card" />
              <Stack.Screen name="review" />
              <Stack.Screen name="profile-preview" />
              <Stack.Screen name="rendered-profile" />
              <Stack.Screen name="raw-notes-pending" />
              <Stack.Screen name="archive" />
              <Stack.Screen name="share" />
              <Stack.Screen name="print" />
              <Stack.Screen name="upgrade" />
            </Stack>
            <StatusBar style="dark" />
          </SavedProfilesProvider>
        </ProfileDraftProvider>
      </AppAccessProvider>
    </GestureHandlerRootView>
  );
}
