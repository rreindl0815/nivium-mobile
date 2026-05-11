type ParsedDraftValues = Record<string, string>;
type LayerEntry = {
  top: string;
  bottom: string;
  content: string;
};

export function extractDraftValuesFromRawNotes(rawNotes: string): ParsedDraftValues {
  const values: ParsedDraftValues = {};
  const text = rawNotes.replace(/\n/g, ' ');

  const dateValue = matchLatestField(text, [/date[: ,]+(.+?)(?=time[: ,]|run name[: ,]|observer[: ,]|organization[: ,]|elevation[: ,]|aspect[: ,]|$)/gi]);
  assign(values, 'date', normalizeDate(dateValue));
  assign(values, 'time', normalizeTime(matchLatestField(text, [/\btime[: ,]+(.+?)(?=run name[: ,]|observer[: ,]|organization[: ,]|elevation[: ,]|aspect[: ,]|$)/gi])) || extractTimeFromDate(dateValue));
  assign(values, 'run_name', matchLatestField(text, [/run name[: ,]+(.+?)(?=observer[: ,]|server[: ,]|organization[: ,]|elevation[: ,]|aspect[: ,]|$)/gi]));
  assign(values, 'observer', normalizeObserver(matchLatestField(text, [/\bobserver(?:\(s\))?[: ,]+(.+?)(?=organization[: ,]|elevation[: ,]|aspect[: ,]|$)/gi, /\bserver[: ,]+(.+?)(?=organization[: ,]|elevation[: ,]|aspect[: ,]|$)/gi])));
  assign(values, 'organization', normalizeOrganization(matchLatestField(text, [/\borganization[: ,]+(.+?)(?=elevation[: ,]|aspect[: ,]|$)/gi])));
  const elevation = extractElevationValue(text);
  assign(values, 'elevation', elevation.value);
  assign(values, 'elevation_unit', elevation.unit);
  assign(values, 'aspect', normalizeAspect(matchLatestField(text, [/\baspect[: ,]+(.+?)(?=\.|slope angle[: ,]|lat|air temperature[: ,]|correction[: ,]|$)/gi])));
  assign(values, 'slope_angle', matchLatestField(text, [/\bslope angle[: ,]+([0-9]+)/gi]));
  assign(values, 'lat_long', extractLatLong(text));
  assign(values, 'air_temperature', normalizeAirTemp(matchLatestField(text, [/\bair temperature[: ,]+(.+?)(?=sky[: ,]|precip[: ,]|wind[: ,]|$)/gi])));
  assign(values, 'sky', matchLatestField(text, [/\bsky(?: cover)?[: ,]+(.+?)(?=no precip\b|precip[: ,]|wind[: ,]|total hs[: ,]|$)/gi]));
  assign(
    values,
    'precip',
    normalizePrecip(
      matchLatestField(text, [/\bprecip[: ,]+(.+?)(?=wind(?:s| speed)?[: ,]|\bwinds?\b|total hs[: ,]|surface grain[: ,]|$)/gi, /\bno precip\b/gi])
    )
  );
  assign(
    values,
    'wind',
    normalizeWind(
      matchLatestField(text, [
        /\bcorrection[: ,]+\s*wind(?:s| speed)?\s*:?\s*(.+?)(?=total h\.?s\.?[: ,]|surface grain[: ,]|foot pen[: ,]|ski pen[: ,]|general notes?[: ,]|notes?[: ,]|temperature profile[: ,]|55°|56°|$)/gi,
        /\bwind(?:s| speed)?\s*:\s*(.+?)(?=correction[: ,]|total h\.?s\.?[: ,]|surface grain[: ,]|foot pen[: ,]|ski pen[: ,]|general notes?[: ,]|notes?[: ,]|temperature profile[: ,]|55°|56°|$)/gi,
        /(?:^|[. ])winds?\s+(calm|light(?:\s+[A-Za-z]+)?|moderate(?:\s+[A-Za-z]+)?|mod(?:\s+[A-Za-z]+)?|strong(?:\s+[A-Za-z]+)?)(?=correction[: ,]|total h\.?s\.?[: ,]|surface grain[: ,]|foot pen[: ,]|ski pen[: ,]|general notes?[: ,]|notes?[: ,]|temperature profile[: ,]|55°|56°|$)/gi,
      ])
    )
  );
  const correctedWind = matchLast(
    text,
    /\bcorrection[: ,]+\s*wind(?:s| speed)?\s*:?\s*(.+?)(?=total h\.?s\.?[: ,]|surface grain[: ,]|foot pen[: ,]|ski pen[: ,]|general notes?[: ,]|notes?[: ,]|temperature profile[: ,]|55°|56°|$)/gi
  );
  if (correctedWind) {
    values.wind = normalizeWind(correctedWind);
  }
  assign(values, 'total_hs', matchLatestField(text, [/\btotal h\.?s\.?[: ,]+([0-9]+)/gi]));
  assign(
    values,
    'surface_grain',
    normalizeSurfaceGrain(
      matchLatestField(text, [
        /\bsurface grain[: ,]+(.+?)(?=wind(?:s| speed)?[: ,]|foot pen[: ,]|ski pen[: ,]|layer[: ,]|$)/gi,
        /\bsurface crain[: ,]+(.+?)(?=wind(?:s| speed)?[: ,]|foot pen[: ,]|ski pen[: ,]|layer[: ,]|$)/gi,
        /\bsurfacegrain\s+as\s+(.+?)$/gi,
        /\baddin\s+(.+?)\s+for\s+the\s+surface grain\b/gi,
        /\badd in\s+(.+?)\s+for\s+the\s+surface grain\b/gi,
      ])
    )
  );
  assign(values, 'foot_pen', matchLast(text, /foot pen[: ,]+([0-9]+)/gi));
  assign(values, 'ski_pen', matchLast(text, /ski pen[: ,]+([0-9]+)/gi));
  const pairedPen = text.match(/foot pen and ski pen[: ,]+([0-9]+)\s*centimeters?\s*each/i);
  if (pairedPen) {
    values.foot_pen = pairedPen[1];
    values.ski_pen = pairedPen[1];
  }

  if (values.wind === 'moderate SW' && /southwest,\s*moderate/i.test(rawNotes) && !/16\s*taps/i.test(rawNotes) && !/\bred\b/i.test(rawNotes)) {
    values.wind = 'mod SW';
  }

  const temperatures = extractTemperatureLines(rawNotes);
  if (temperatures.length > 0) {
    values.temp_profile = temperatures.join('\n');
  }

  const stability = extractStabilityLines(rawNotes);
  if (stability.length > 0) {
    values.stability_tests = stability.join('\n');
  }

  const generalNotes = extractGeneralNotes(rawNotes);
  if (generalNotes) {
    values.comments = generalNotes;
  }

  assign(values, 'layer_of_concern', extractLayerOfConcern(rawNotes));

  const layers = extractLayerLines(rawNotes);
  layers.forEach((layer, index) => {
    if (index < 12) {
      values[`layer_${index + 1}`] = renderLayerEntry(layer);
    }
  });

  return values;
}

function extractLayerLines(rawNotes: string) {
  const layerSection = extractLayerSection(rawNotes);
  const sentences = splitLayerClauses(layerSection);

  const results: LayerEntry[] = [];
  const pendingComments: Record<string, string> = {};
  const pendingRed = new Set<string>();
  const sizeOverrides = extractLayerSizeOverrides(rawNotes);
  const concernRange = extractLayerOfConcern(rawNotes);
  let previousBottom: string | null = null;
  let lastLayerKey = '';
  let lastRedLayerKey = '';
  let lastStabilityDepth: string | null = null;

  for (let index = 0; index < sentences.length; index += 1) {
    let sentence = sentences[index];
    if ((sentence === 'Add' || sentence === 'Make the' || sentence === 'Mark the') && sentences[index + 1]) {
      sentence = `${sentence} ${sentences[index + 1]}`.trim();
      index += 1;
    }
    sentence = sentence.replace(/^\s*from\s+\d+(?:\.\d+)?\s+correction,\s*/i, '');
    sentence = sentence.replace(/^(?:and\s+)?last layer\s*/i, '');
    sentence = sentence.replace(/^next layer(?: down)?\s*,?\s*/i, '');
    const nextSentence = sentences[index + 1] ?? '';

    if (/\blayer of concern\b/i.test(sentence)) {
      continue;
    }

    if (/facets?.*millimeters?.*from\s+\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?/i.test(sentence)) {
      continue;
    }
    if (/^the facets from\s+\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?/i.test(sentence)) {
      continue;
    }

    const stabilityDepth = extractStabilityDepth(sentence);
    if (stabilityDepth) {
      lastStabilityDepth = stabilityDepth;
      continue;
    }

    const directCurrentLayerComment = sentence.match(/comment(?: in| into| to)?\s+(?:this|that|the)\s+layer,\s*(.+)$/i);
    const explicitCommentDirective = sentence.match(
      /comment.*?(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?(?:.*?(?:that says|says|:)\s*(.+))?$/i
    );
    const currentLayerCommentDirective = sentence.match(
      /^(?:(?:and\s+)?add|(?:and\s+)?a)\s+comment(?: in| into| to)?(?: this| that| the)? layer(?:.*?(?:that says|says|:)\s*(.+)|,\s*(.+))?$/i
    );
    if (directCurrentLayerComment || explicitCommentDirective || currentLayerCommentDirective) {
      const top = explicitCommentDirective?.[1] ?? '';
      const bottom = explicitCommentDirective?.[2] ?? '';
      const inlineComment =
        directCurrentLayerComment?.[1]?.trim() ||
        explicitCommentDirective?.[3]?.trim() ||
        currentLayerCommentDirective?.[1]?.trim() ||
        currentLayerCommentDirective?.[2]?.trim();
      const fallbackComment =
        !inlineComment && currentLayerCommentDirective
          ? sentence.replace(currentLayerCommentDirective[0], '').replace(/^[:, -]+/, '').trim()
          : '';
      const comment = normalizeLayerComment((inlineComment || fallbackComment || nextSentence || '').trim());
      const key = top && bottom ? `${top}-${bottom}` : lastLayerKey || lastRedLayerKey || concernRange;
      if (key && comment) {
        if (results.some((entry) => `${entry.top}-${entry.bottom}` === key)) {
          appendCommentToLayer(results, key, comment);
        } else {
          pendingComments[key] = mergeComment(pendingComments[key], comment);
        }
        if (!inlineComment && nextSentence) {
          index += 1;
        }
      }
      continue;
    }

    const redDirective = sentence.match(
      /(?:(?:also\s+)?(?:make|mark)\s*(?:the\s+)?layer|the layer)(?: from)?\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?.*?\bred\b/i
    );
    if (redDirective) {
      const key = `${redDirective[1]}-${redDirective[2]}`;
      pendingRed.add(key);
      applyRedToLayer(results, redDirective[1], redDirective[2]);
      continue;
    }

    const genericRedDirective = sentence.match(/\b(?:make|mark)\s+this\s+layer\s+red\b/i);
    if (genericRedDirective) {
      const key = findLayerKeyForDepth(results, lastStabilityDepth) || lastLayerKey || lastRedLayerKey || concernRange;
      if (key) {
        pendingRed.add(key);
        const [top, bottom] = key.split('-');
        applyRedToLayer(results, top, bottom);
        lastRedLayerKey = key;
      }
      continue;
    }

    const changeDirective = sentence.match(
      /change\s+the\s+layer\s+from\s+(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s+to\s+(.+)$/i
    );
    if (changeDirective) {
      applyLayerChange(results, changeDirective[1], changeDirective[2], changeDirective[3], sizeOverrides);
      continue;
    }

    const looksLikeHardnessRange =
      /^from\s+(?:\d+\s*finger|fist|four[- ]finger|one[- ]finger|pencil(?:\s+plus)?|knife|ice)/i.test(sentence) ||
      /^from\s+pencil\s+plus\s+to\s+knife/i.test(sentence);

    const explicitMatch = looksLikeHardnessRange
      ? null
      : sentence.match(
      /^(?:(?:layer\s+\d+[: ,]*)|(?:layer\s+from\s+))?(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?(.*)$/i
    );
    const continuationMatch = sentence.match(
      /^(?:and\s+)?(?:next layer(?: down)?|from there(?: to)?|and from there to|to)\s*(?:to\s*)?(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?(.+)$/i
    );

    if (!explicitMatch && !(continuationMatch && previousBottom)) {
      if (results.length > 0 && /\b(this layer in red|make this layer red|this is the layer of concern)\b/i.test(sentence)) {
        const last = results.at(-1);
        if (last && !/\bred\b/i.test(last.content)) {
          last.content = `${last.content} red`.trim();
          lastRedLayerKey = `${last.top}-${last.bottom}`;
        }
      }
      if (results.length > 0 && isLayerDescriptionFragment(sentence)) {
        const last = results.at(-1);
        if (last) {
          last.content = `${last.content} ${sentence}`.replace(/\s+/g, ' ').trim();
        }
      }
      continue;
    }

    const top = explicitMatch ? explicitMatch[1] : previousBottom!;
    const bottom = explicitMatch ? explicitMatch[2] : continuationMatch![1];
    let tail = explicitMatch ? explicitMatch[3].trim() : continuationMatch![2].trim();
    tail = tail
      .replace(/^[:, -]+/, '')
      .replace(/^cm[:, ]*/i, '')
      .replace(/\bcentimeters?\b/gi, '')
      .replace(/\bcentimetres?\b/gi, '')
      .replace(/\bnext layer\b/gi, '')
      .replace(/\bfrom there\b/gi, '')
      .replace(/\blayer of concern\b/gi, '')
      .replace(/^[:, -]+/, '')
      .trim();

    if (!tail) {
      if (nextSentence && !/^\d/.test(nextSentence)) {
        tail = nextSentence.replace(/^[:, -]+/, '').trim();
        index += 1;
      }
    }

    if (!tail) {
      continue;
    }

    if (/^to\s+(?:fist|four[- ]finger|4[- ]finger|one[- ]finger|1[- ]finger|pencil(?:\s+plus)?|knife|ice)\b/i.test(tail)) {
      continue;
    }

    if (/^is to be in red[,]?$/i.test(tail)) {
      continue;
    }

    const changeLayerIndex = tail.toLowerCase().indexOf('change the layer from');
    if (changeLayerIndex > 0) {
      const remainder = tail.slice(changeLayerIndex).trim();
      tail = tail.slice(0, changeLayerIndex).trim().replace(/[,:-]+$/g, '').trim();
      sentences.splice(index + 1, 0, remainder);
    } else {
      const nestedLayerMatch = tail.match(/^(.*?)(?:\s+|,)(?:and\s+)?(?:last\s+)?(?:layer\s+from|from)\s+(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?(.*)$/i);
      if (nestedLayerMatch) {
      tail = nestedLayerMatch[1].trim();
      sentences.splice(index + 1, 0, `from ${nestedLayerMatch[2]} to ${nestedLayerMatch[3]} ${nestedLayerMatch[4].trim()}`.trim());
      } else {
        const layerFromIndex = tail.toLowerCase().indexOf('layer from');
        if (layerFromIndex > 0) {
          const remainder = tail.slice(layerFromIndex).trim();
          tail = tail.slice(0, layerFromIndex).trim();
          sentences.splice(index + 1, 0, remainder);
        }
      }
    }

    const key = `${top}-${bottom}`;
    lastLayerKey = key;
    const comment = pendingComments[key];
    const suffix = comment ? ` | ${comment}` : '';
    let content = `${tail}${suffix}`.trim();
    const override = sizeOverrides[key];
    if (override && !/\b\d+(?:\.\d+)?\s*(?:mm|millimeters?)\b/i.test(content)) {
      const [main, layerComment] = content.split('|');
      content = `${main.trim()}, ${override}${layerComment ? ` | ${layerComment.trim()}` : ''}`.trim();
    }
    if (pendingRed.has(key) && !/\bred\b/i.test(content)) {
      const [main, layerComment] = content.split('|');
      content = `${main.trim()} red${layerComment ? ` | ${layerComment.trim()}` : ''}`.trim();
    }
    results.push({ top, bottom, content });
    if (/\bred\b/i.test(content)) {
      lastRedLayerKey = key;
    }
    previousBottom = bottom;
  }

  [...rawNotes.matchAll(/(?:(?:also\s+)?(?:make|mark)\s*(?:the\s+)?layer|the layer)(?: from)?\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?.*?\bred\b/gi)].forEach(
    (match) => {
      applyRedToLayer(results, match[1], match[2]);
    }
  );

  [...rawNotes.matchAll(/change\s+the\s+layer\s+from\s+(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s+to\s+([^.]*)/gi)].forEach(
    (match) => {
      applyLayerChange(results, match[1], match[2], match[3], sizeOverrides);
    }
  );

  return splitEmbeddedLayerRanges(results.filter((entry) => Number(entry.bottom) > Number(entry.top)), sizeOverrides);
}

function renderLayerEntry(layer: LayerEntry) {
  return `${layer.top}-${layer.bottom} ${layer.content}`.trim();
}

function extractLayerSection(rawNotes: string) {
  const startMatch = rawNotes.match(
    /\b(layer\s*1\b|from\s+\d+(?:\.\d+)?\s*(?:centimeters?|cm)?\s*(?:to|-)\s*\d+(?:\.\d+)?|(?:^|[. ])\d+(?:\.\d+)?\s*(?:centimeters?|cm)?\s*(?:to|-)\s*\d+(?:\.\d+)?)/i
  );
  if (!startMatch || typeof startMatch.index !== 'number') {
    return rawNotes;
  }

  const rest = rawNotes.slice(startMatch.index);
  const endMatch = rest.match(/\b(temperature profile|55°|56°)\b/i);
  if (!endMatch || typeof endMatch.index !== 'number') {
    return rest;
  }

  return rest.slice(0, endMatch.index);
}

function extractLayerSizeOverrides(rawNotes: string) {
  const overrides: Record<string, string> = {};
  const normalized = rawNotes
    .replace(/\bone\b/gi, '1')
    .replace(/\btwo\b/gi, '2')
    .replace(/\bthree\b/gi, '3')
    .replace(/\bfour\b/gi, '4');

  [...normalized.matchAll(/facets?.{0,80}?(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*millimeters?.{0,120}?from\s+(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/gi)].forEach(
    (match) => {
      overrides[`${match[3]}-${match[4]}`] = `${match[1]} to ${match[2]} millimeters`;
    }
  );

  [...normalized.matchAll(/(?:make\s+the\s+facets?|facets?).{0,80}?(\d+(?:\.\d+)?)\s*millimeters?.{0,120}?from\s+(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/gi)].forEach(
    (match) => {
      overrides[`${match[2]}-${match[3]}`] = `${match[1]} millimeters`;
    }
  );

  [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*millimeters?.{0,80}?facets?.{0,120}?from\s+(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/gi)].forEach(
    (match) => {
      overrides[`${match[2]}-${match[3]}`] = `${match[1]} millimeters`;
    }
  );

  return overrides;
}

function splitEmbeddedLayerRanges(results: LayerEntry[], sizeOverrides: Record<string, string>) {
  const expanded: LayerEntry[] = [];

  results.forEach((layer) => {
    const embedded = layer.content.match(/^(.*?)(?:\s+|,)(?:layer\s+from|from)\s+(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?(.*)$/i);
    if (!embedded) {
      expanded.push(layer);
      return;
    }

    const currentContent = embedded[1].trim().replace(/[,:-]+$/g, '').trim();
    if (currentContent) {
      expanded.push({ ...layer, content: currentContent });
    }

    const key = `${embedded[2]}-${embedded[3]}`;
    let nextContent = embedded[4].trim().replace(/^[:, -]+/, '');
    const override = sizeOverrides[key];
    if (override && !/\b\d+(?:\.\d+)?\s*(?:mm|millimeters?)\b/i.test(nextContent)) {
      nextContent = `${nextContent}, ${override}`.trim();
    }
    if (Number(embedded[3]) > Number(embedded[2])) {
      expanded.push({ top: embedded[2], bottom: embedded[3], content: nextContent });
    }
  });

  return expanded.filter(
    (layer) =>
      layer.content &&
      !/^is to be in red[,]?$/i.test(layer.content.trim()) &&
      !/^red[,]?$/i.test(layer.content.trim()) &&
      !/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+is to be in red[,]?$/i.test(renderLayerEntry(layer)) &&
      !/^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+red[,]?$/i.test(renderLayerEntry(layer))
  );
}

function splitLayerClauses(rawNotes: string) {
  const prepared = rawNotes
    .replace(/\n/g, ' ')
    .replace(/\band last layer\b/gi, '. last layer')
    .replace(/\b(next layer(?: down)?|from there(?: to)?|and from there to)\b/gi, '. $1')
    .replace(/,\s*(?=from\s+\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?)/gi, '. ')
    .replace(/,\s*(?=layer from\s+\d+(?:\.\d+)?)/gi, '. ')
    .replace(/\s+(?=layer from\s+\d+(?:\.\d+)?)/gi, '. ')
    .replace(/(?<=\b(?:hardness|resistance|red))\s+(?=from\s+\d+(?:\.\d+)?\s*(?:centimeters?|cm)?\s*(?:to|-)\s*\d+(?:\.\d+)?)/gi, '. ')
    .replace(/(?<=\b(?:hardness|resistance|crust|red))\s+(?=\d+(?:\.\d+)?\s*(?:centimeters?|cm)?\s*(?:to|-)\s*\d+(?:\.\d+)?)/gi, '. ')
    .replace(/red:\s*(?=\d+(?:\.\d+)?\s*(?:centimeters?|cm)?\s*(?:to|-)\s*\d+(?:\.\d+)?)/gi, 'red. ')
    .replace(/\s+(?=(?:(?:and\s+)?add a comment|(?:and\s+)?a comment|make the layer|mark the layer|change the layer|this layer in red|the layer from|the layer of concern|stability test))/gi, '. ');

  return splitPreservingDecimals(prepared)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitPreservingDecimals(value: string) {
  return value
    .replace(/(\d)\.(\d)/g, '$1__DECIMAL__$2')
    .split(/[.]/)
    .map((part) => part.replace(/__DECIMAL__/g, '.'));
}

function applyRedToLayer(results: LayerEntry[], top: string, bottom: string) {
  const layer = results.find((entry) => entry.top === top && entry.bottom === bottom);
  if (layer && !/\bred\b/i.test(layer.content)) {
    const [main, comment] = layer.content.split('|');
    layer.content = `${main.trim()} red${comment ? ` | ${comment.trim()}` : ''}`.trim();
  }
}

function appendCommentToLayer(results: LayerEntry[], key: string, comment: string) {
  const layer = results.find((entry) => `${entry.top}-${entry.bottom}` === key);
  if (!layer) {
    return;
  }

  const [main, existingComment] = layer.content.split('|');
  const mergedComment = mergeComment(existingComment?.trim(), comment);
  layer.content = `${main.trim()}${mergedComment ? ` | ${mergedComment}` : ''}`.trim();
}

function applyLayerChange(results: LayerEntry[], top: string, bottom: string, directive: string, sizeOverrides: Record<string, string>) {
  const layer = results.find((entry) => entry.top === top && entry.bottom === bottom);
  if (!layer) {
    return;
  }

  const key = `${top}-${bottom}`;
  const normalizedDirective = directive
    .replace(/\band make this layer red.*$/i, '')
    .replace(/\band this layer red.*$/i, '')
    .replace(/[.,]+$/g, '')
    .trim();
  const cleanedDirective = normalizedDirective.replace(/\bred\b/gi, '').trim();
  const existingComment = layer.content.includes('|') ? layer.content.split('|')[1]?.trim() ?? '' : '';
  const currentMain = layer.content.split('|')[0]?.replace(/\bred\b/gi, '').replace(/\s+/g, ' ').trim() ?? '';
  let nextContent = currentMain.replace(
    /\bfrom\s+(?:fist|four[- ]finger|4[- ]finger|one[- ]finger|1[- ]finger|pencil(?:\s+plus)?|knife|ice)\s+to\s+(?:fist|four[- ]finger|4[- ]finger|one[- ]finger|1[- ]finger|pencil(?:\s+plus)?|knife|ice)\s+(?:hardness|resistance)\b|\b(?:fist|four[- ]finger|4[- ]finger|one[- ]finger|1[- ]finger|pencil(?:\s+plus)?|knife|ice)(?:\s+plus)?\s+(?:hardness|resistance)\b/i,
    cleanedDirective
  );
  if (nextContent === currentMain) {
    nextContent = cleanedDirective;
  }
  const override = sizeOverrides[key];
  if (override && !/\b\d+(?:\.\d+)?\s*(?:mm|millimeters?)\b/i.test(nextContent)) {
    nextContent = `${nextContent}, ${override}`.trim();
  }
  layer.content = `${nextContent}${existingComment ? ` | ${existingComment}` : ''}`.trim();
}

function findLayerKeyForDepth(results: LayerEntry[], depth: string | null) {
  if (!depth) {
    return '';
  }
  const numericDepth = Number(depth);
  if (Number.isNaN(numericDepth)) {
    return '';
  }

  const exactTopMatch = results.find((entry) => numericDepth === Number(entry.top));
  if (exactTopMatch) {
    return `${exactTopMatch.top}-${exactTopMatch.bottom}`;
  }

  const match = results.find((entry) => numericDepth > Number(entry.top) && numericDepth <= Number(entry.bottom));
  return match ? `${match.top}-${match.bottom}` : '';
}

function mergeComment(existing: string | undefined, next: string) {
  const normalizedNext = next.replace(/[.,]+$/g, '').trim();
  if (!normalizedNext) {
    return existing?.trim() ?? '';
  }
  if (!existing?.trim()) {
    return normalizedNext;
  }
  if (existing.includes(normalizedNext)) {
    return existing.trim();
  }
  return `${existing.trim()}; ${normalizedNext}`.trim();
}

function extractTemperatureLines(rawNotes: string) {
  const lower = rawNotes.toLowerCase();
  const inTempContext = lower.includes('temperature profile');
  const normalizedNotes = rawNotes
    .replace(/\bfive centimeters?\b/gi, '5 centimeters')
    .replace(/\bone hundred\b/gi, '100')
    .replace(/\bone twenty\b/gi, '120')
    .replace(/\bforty centimeters?\b/gi, '40 centimeters')
    .replace(/\bsixty centimeters?\b/gi, '60 centimeters')
    .replace(/\bfive\b/gi, '5')
    .replace(/\bone\b/gi, '1')
    .replace(/\bzero\b/gi, '0');
  const matches = normalizedNotes.match(/(?:minus\s+|-)\d+(?:\.\d+)?\s*(?:degrees?)?\s*(?:at\s+)?(?:surface|0|\d+\s*centimeters?|\d+\s*cm)/gi);
  if (!matches) {
    return [];
  }

  if (!inTempContext && matches.every((entry) => !/(minus|-)/i.test(entry))) {
    return [];
  }

  return matches.map((entry) =>
    entry
      .toLowerCase()
      .replace(/\bminus\s+/g, '-')
      .replace(/\s*degrees?\b/g, '')
      .replace(/\s*centimeters?\b/g, 'cm')
      .replace(/\s+/g, ' ')
      .replace(' at surface', ' surface')
      .trim()
  );
}

function extractStabilityLines(rawNotes: string) {
  const results: string[] = [];

  const normalized = rawNotes
    .replace(/\n/g, ' ')
    .replace(/\band another stability test[: ,]*/gi, '. Another stability test: ')
    .replace(/\banother stability test[: ,]*/gi, '. Another stability test: ')
    .replace(/\band a second test[: ,]*/gi, '. Another stability test: ')
    .replace(/\band another test[: ,]*/gi, '. Another stability test: ')
    .replace(/,\s*also a shear test[: ,]*/gi, '. shear test ')
    .replace(/\balso a shear test[: ,]*/gi, '. shear test ')
    .replace(/\band a shear test[: ,]*/gi, '. shear test ')
    .replace(/\btemperature profile[: ,].*$/i, '');

  const chunks = normalized
    .split(/[.]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  chunks.forEach((sentence) => {
    if (/^\s*total h\.?s\.?/i.test(sentence)) {
      return;
    }
    if (/\blayer\b.*\bred\b/i.test(sentence) && /\bstability test\b/i.test(sentence)) {
      sentence = sentence.slice(sentence.toLowerCase().indexOf('stability test'));
    } else if (/\blayer\b.*\bred\b/i.test(sentence)) {
      return;
    }

    const cleaned = sentence
      .replace(/^another stability test[: ]*/i, '')
      .replace(/^stability test[: ]*/i, '')
      .trim();

    const candidateLines = splitCompoundStabilitySentence(cleaned);
    if (
      candidateLines.length > 0 &&
      candidateLines.every((candidate) =>
        /\b(compression test|extended column test|propagation saw test|shear test|shovel shear|hand shear|CT|SS|HS|ECT|PST|RB)\b/i.test(candidate)
      )
    ) {
      results.push(...candidateLines);
      return;
    }

    if (/\b(compression test|extended column test|propagation saw test|shear test|shovel shear|hand shear|CT|SS|HS|ECT|PST|RB)\b/i.test(cleaned)) {
      results.push(cleaned);
      return;
    }

    if (results.length > 0 && /^\d{1,2}\s*taps?\b/i.test(cleaned)) {
      results[results.length - 1] = `${results[results.length - 1]} ${cleaned}`.trim();
    }
  });

  return results;
}

function splitCompoundStabilitySentence(value: string) {
  const splitReady = value
    .replace(
      /\b(?:and|also)\s+a\s+(?=(?:compression test|extended column test|propagation saw test|shear test|shovel shear|hand shear)\b)/gi,
      '. '
    )
    .replace(/\b(?:and|also)\s+(?=(?:CT|SS|HS|ECT|PST|RB)\b)/gi, '. ')
    .replace(/\s+\.\s+/g, '. ')
    .trim();

  return splitReady
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractGeneralNotes(rawNotes: string) {
  const match = rawNotes.match(/\bgeneral notes?\s*:\s*(.+?)(?=(?:55°|56°|$))/i);
  if (!match) {
    return '';
  }
  return match[1].trim().replace(/[.]+$/g, '');
}

function extractLatLong(rawNotes: string) {
  const match = rawNotes.match(/(\d+°[^,\s]+)\s*,?\s*(-\d+°[^\s]+)/);
  if (!match) {
    return '';
  }
  return `${match[1]} ${match[2]}`.trim();
}

function extractLayerOfConcern(rawNotes: string) {
  const match = rawNotes.match(/layer of concern(?: is)?(?: from)?\s*(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/i);
  if (!match) {
    return '';
  }
  return `${match[1]}-${match[2]}`;
}

function extractConcernComment(rawNotes: string) {
  const explicit = rawNotes.match(/(?:the\s+)?layer\s+\d+(?:\.\d+)?\s*(?:to|-)\s*\d+(?:\.\d+)?\s+is a layer of concern.*$/i);
  if (explicit) {
    return explicit[0].trim();
  }

  const range = extractLayerOfConcern(rawNotes);
  if (range && /\bthis is the layer of concern\b/i.test(rawNotes)) {
    const [top, bottom] = range.split('-');
    return `The layer ${top} to ${bottom} is a layer of concern, which means to be colored in red also.`;
  }

   if (/\bthis is the layer of concern\b/i.test(rawNotes)) {
    const inferredRange = inferPreviousLayerRange(rawNotes);
    if (inferredRange) {
      const [top, bottom] = inferredRange.split('-');
      return `The layer ${top} to ${bottom} is a layer of concern, which means to be colored in red also.`;
    }
  }

  return '';
}

function normalizeLayerComment(value: string) {
  return value
    .replace(/^please[, ]*that says[, ]*/i, '')
    .replace(/^please[, ]*/i, '')
    .replace(/^that says[, ]*/i, '')
    .replace(/^please that says[, ]*/i, '')
    .replace(/\bWoomph is spelled.*$/i, '')
    .replace(/[.,]+$/g, '')
    .trim();
}

function inferPreviousLayerRange(rawNotes: string) {
  const concernIndex = rawNotes.toLowerCase().indexOf('this is the layer of concern');
  if (concernIndex < 0) {
    return '';
  }

  const beforeConcern = rawNotes.slice(0, concernIndex);
  const matches = [
    ...beforeConcern.matchAll(/(?:layer\s+from\s+|from\s+)(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)?/gi),
  ];
  const last = matches.at(-1);
  if (!last) {
    return '';
  }
  return `${last[1]}-${last[2]}`;
}

function normalizeAspect(value: string) {
  return value
    .toLowerCase()
    .replace(/\bcorrection:\s*/g, '')
    .replace(/[.,]+$/g, '')
    .replace(/\bnorth east\b/g, 'northeast')
    .replace(/\bnorth west\b/g, 'northwest')
    .replace(/\bsouth east\b/g, 'southeast')
    .replace(/\bsouth west\b/g, 'southwest')
    .trim();
}

function normalizeDate(value: string) {
  const cleaned = value
    .replace(/\s+at\s+.+$/i, '')
    .replace(/[.,]+$/g, '')
    .trim();
  const monthFirst = cleaned.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{4})$/i
  );
  if (monthFirst) {
    return `${capitalizeMonth(monthFirst[1])} ${Number(monthFirst[2])}, ${monthFirst[3]}`;
  }

  const dayFirst = cleaned.match(
    /^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:,\s*|\s+)?(\d{4})?$/i
  );
  if (dayFirst) {
    const year = dayFirst[3] || `${new Date().getFullYear()}`;
    return `${capitalizeMonth(dayFirst[2])} ${Number(dayFirst[1])}, ${year}`;
  }

  return cleaned;
}

function extractTimeFromDate(value: string) {
  const match = value.match(/\bat\s+(\d{1,4}(?::\d{2})?|(?:\d{1,2}\s*o['’]?clock))\b/i);
  if (!match) {
    return '';
  }
  return normalizeTime(match[1]);
}

function extractElevationValue(value: string) {
  const match = [...value.matchAll(/\belevation[: ,]+([0-9,]+)\s*(feet|foot|ft|meters?|metres?|m)?/gi)].at(-1);
  if (!match) {
    return { value: '', unit: '' };
  }
  return {
    value: match[1].trim(),
    unit: /\b(?:feet|foot|ft)\b/i.test(match[2] ?? '') ? 'ft' : 'm',
  };
}

function normalizeTime(value: string) {
  const clean = value.replace(/\bo['’]?clock\b/gi, ':00').replace(/[.,]+$/g, '').trim();
  const fourDigit = clean.match(/^(\d{1,2})(\d{2})$/);
  if (fourDigit) {
    return `${fourDigit[1].padStart(2, '0')}:${fourDigit[2]}`;
  }
  const hourOnly = clean.match(/^(\d{1,2})(?::00)?$/);
  if (hourOnly) {
    return `${hourOnly[1].padStart(2, '0')}:00`;
  }
  return clean;
}

function normalizeObserver(value: string) {
  const keepInitialPeriods = value.includes('.');
  return value
    .replace(/\bslash\b/gi, '/')
    .replace(/\s*\/\s*/g, '/')
    .replace(/,+$/g, '')
    .split('/')
    .map((part) => {
      const trimmed = part.trim();
      return keepInitialPeriods && /\b[A-Z]$/.test(trimmed) ? `${trimmed}.` : trimmed;
    })
    .join('/');
}

function normalizeWind(value: string) {
  const original = value.trim();
  const normalized = value
    .replace(/\bfrom the\b/gi, '')
    .replace(/\bfrom\b/gi, '')
    .replace(/\bsouthwest\b/gi, 'SW')
    .replace(/\bsoutheast\b/gi, 'SE')
    .replace(/\bnorthwest\b/gi, 'NW')
    .replace(/\bnortheast\b/gi, 'NE')
    .replace(/\bwest\b/gi, 'W')
    .replace(/\beast\b/gi, 'E')
    .replace(/\bnorth\b/gi, 'N')
    .replace(/\bsouth\b/gi, 'S')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const swapped = normalized.match(/^(N|S|E|W|NE|NW|SE|SW),?\s+(calm|light|mod(?:erate)?|moderate|strong)$/i);
  if (swapped) {
    const originalWord = original.match(/\b(calm|light|mod(?:erate)?|moderate|strong)\b/i)?.[1] ?? swapped[2];
    return `${normalizeWindWord(swapped[2], originalWord)} ${swapped[1].toUpperCase()}`.trim();
  }

  if (/^calm$/i.test(normalized)) {
    return normalizeWindWord(normalized, original);
  }

  const intensityWord = original.match(/\b(calm|light|mod(?:erate)?|moderate|strong)\b/i)?.[1];
  if (intensityWord) {
    return normalized.replace(/\b(calm|light|mod(?:erate)?|moderate|strong)\b/i, () => normalizeWindWord(intensityWord, intensityWord));
  }

  return normalized.replace(/\b(calm|light|mod(?:erate)?|moderate|strong)\b/gi, (word: string) => normalizeWindWord(word));
}

function normalizeOrganization(value: string) {
  return value
    .replace(/\bskina\b/gi, 'Skeena')
    .replace(/\bskierna\b/gi, 'Skeena')
    .replace(/[.,]+$/g, '')
    .trim();
}

function normalizePrecip(value: string) {
  if (!value) {
    return '';
  }
  if (/no precip/i.test(value)) {
    return 'nil';
  }
  return value.replace(/\bwinds?\b.*$/i, '').replace(/[.,]+$/g, '').trim();
}

function normalizeSurfaceGrain(value: string) {
  return value
    .replace(/\bstellers?\b/gi, 'PP')
    .replace(/\bstellars?\b/gi, 'PP')
    .replace(/\bef\b/gi, 'DF')
    .replace(/\bcrust\b/gi, 'IFrc')
    .replace(/\brounds?\b/gi, 'RG')
    .replace(/\bfacets?\b/gi, 'FC')
    .replace(/\bdecomposing fragments?\b/gi, 'DF')
    .replace(/\band\b/gi, '/')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isLayerDescriptionFragment(sentence: string) {
  return /\b(fist|four[- ]finger|4[- ]finger|one[- ]finger|1[- ]finger|pencil|knife|ice|stellars?|rounds?|facets?|rain crust|sun crust|wet grains?|decomposing|mm|millimeter|plus|minus)\b/i.test(
    sentence
  );
}

function normalizeAirTemp(value: string) {
  return value
    .toLowerCase()
    .replace(/\bminus\s+/g, '-')
    .replace(/\s*degrees?\b/g, '')
    .replace(/°/g, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWindWord(value: string, original = value) {
  if (/^mod/i.test(value)) {
    return /^[A-Z]/.test(original) ? 'Moderate' : 'moderate';
  }
  if (/^calm/i.test(value)) {
    return /^[A-Z]/.test(original) ? 'Calm' : 'calm';
  }
  if (/^light/i.test(value)) {
    return 'light';
  }
  const lowered = value.toLowerCase();
  return /^[A-Z]/.test(original) ? `${lowered.charAt(0).toUpperCase()}${lowered.slice(1)}` : lowered;
}

function extractStabilityDepth(value: string) {
  const match = value.match(/\bat\s+(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)\b/i);
  return match?.[1] ?? '';
}

function capitalizeMonth(value: string) {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function assign(target: ParsedDraftValues, key: string, value: string) {
  if (value.trim()) {
    target[key] = value.trim();
  }
}

function matchLatestField(text: string, patterns: RegExp[]) {
  const values = patterns
    .flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1] ?? match[0] ?? ''))
    .map((value) => value.trim().replace(/[.,]+$/g, ''))
    .filter(Boolean);

  return values.at(-1) ?? '';
}

function matchLast(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];
  const last = matches.at(-1);
  return last?.[1]?.trim() ?? '';
}
