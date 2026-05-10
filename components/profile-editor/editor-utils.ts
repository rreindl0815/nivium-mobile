export function buildTimeOptions(startHour: number, endHour: number, minuteStep: number) {
  const options: string[] = [];

  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += minuteStep) {
      options.push(`${hour}:${minute.toString().padStart(2, '0')}`);
    }
  }

  return options;
}

export function parseDateParts(value: string) {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) {
    return { month: '', day: '', year: '' };
  }
  return {
    month: match[1],
    day: match[2],
    year: match[3],
  };
}

export function composeDate(month: string, day: string, year: string) {
  if (!month || !day || !year) {
    return '';
  }
  return `${month} ${day}, ${year}`;
}

export function parseWindValue(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { speed: '', direction: '' };
  }
  if (parts[0]?.toLowerCase() === 'calm') {
    return { speed: 'calm', direction: '' };
  }
  return {
    speed: parts[0]?.toLowerCase() ?? '',
    direction: (parts[1] ?? '').toUpperCase(),
  };
}

export function buildWindValue(speed: string, direction: string) {
  if (!speed) {
    return '';
  }
  if (speed === 'calm') {
    return 'calm';
  }
  return [speed, direction].filter(Boolean).join(' ').trim();
}
