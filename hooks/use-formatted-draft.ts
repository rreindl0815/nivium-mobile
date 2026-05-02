import { useMemo } from 'react';

import { useProfileDraft } from '@/context/profile-draft-context';
import { formatDraftToEngineText } from '@/utils/formatter';

export function useFormattedDraft() {
  const { draft } = useProfileDraft();

  return useMemo(() => formatDraftToEngineText(draft), [draft]);
}
