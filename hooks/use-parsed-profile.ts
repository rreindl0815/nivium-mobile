import { useMemo } from 'react';

import { useSavedProfiles } from '@/context/saved-profiles-context';
import { useFormattedDraft } from '@/hooks/use-formatted-draft';
import { parseFormattedProfile } from '@/utils/profile-document';

export function useParsedProfile(formattedTextOverride?: string) {
  const { selectedProfile } = useSavedProfiles();
  const { formattedText } = useFormattedDraft();
  const sourceText = formattedTextOverride ?? selectedProfile?.formattedText ?? formattedText;

  return useMemo(() => parseFormattedProfile(sourceText), [sourceText]);
}
