/*
  Shared weather source. The weather app and the glance page read the same
  forecast through this module so their conditions can never disagree.
*/
export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface Forecast {
  tempC: number;
  feelsC: number;
  code: number;
  wind: number;
  humidity: number;
  hourly: { time: string; tempC: number; code: number; precip: number }[];
  daily: { date: string; code: number; hiC: number; loC: number }[];
}

export const CODES: Record<number, { label: string; glyph: string }> = {
  0: { label: 'clear', glyph: 'sun' },
  1: { label: 'mostly clear', glyph: 'sun' },
  2: { label: 'partly cloudy', glyph: 'suncloud' },
  3: { label: 'overcast', glyph: 'cloud' },
  45: { label: 'fog', glyph: 'fog' },
  48: { label: 'rime fog', glyph: 'fog' },
  51: { label: 'light drizzle', glyph: 'rain' },
  53: { label: 'drizzle', glyph: 'rain' },
  55: { label: 'heavy drizzle', glyph: 'rain' },
  61: { label: 'light rain', glyph: 'rain' },
  63: { label: 'rain', glyph: 'rain' },
  65: { label: 'heavy rain', glyph: 'rain' },
  66: { label: 'freezing rain', glyph: 'rain' },
  67: { label: 'freezing rain', glyph: 'rain' },
  71: { label: 'light snow', glyph: 'snow' },
  73: { label: 'snow', glyph: 'snow' },
  75: { label: 'heavy snow', glyph: 'snow' },
  77: { label: 'snow grains', glyph: 'snow' },
  80: { label: 'showers', glyph: 'rain' },
  81: { label: 'showers', glyph: 'rain' },
  82: { label: 'violent showers', glyph: 'rain' },
  85: { label: 'snow showers', glyph: 'snow' },
  86: { label: 'snow showers', glyph: 'snow' },
  95: { label: 'thunderstorm', glyph: 'storm' },
  96: { label: 'thunderstorm', glyph: 'storm' },
  99: { label: 'thunderstorm', glyph: 'storm' }
};

export const codeOf = (c: number) => CODES[c] ?? { label: '—', glyph: 'cloud' };

export const GLYPHS: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7L17 17M7 7 5.3 5.3"/>',
  suncloud: '<circle cx="8" cy="8" r="3"/><path d="M8 2.8v1.6M2.8 8h1.6M4.3 4.3l1.1 1.1M13 8.5a4.5 4.5 0 0 0-.6.05A5 5 0 0 0 3 11.5 3.3 3.3 0 0 0 5.5 18h8a4 4 0 1 0-.5-7.97" transform="translate(2.5 1.5)"/>',
  cloud: '<path d="M15 18.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 18.5h9.5z"/>',
  fog: '<path d="M15 13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11 2.2A3.6 3.6 0 0 0 5 13h10zM4 16.5h13M6.5 19.5h11"/>',
  rain: '<path d="M15 14.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 14.5h9.5z"/><path d="M8 17.5l-1 2.5M12.5 17.5l-1 2.5M17 17.5l-1 2.5"/>',
  snow: '<path d="M15 14.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 14.5h9.5z"/><path d="M8 18.2v.01M12 20v.01M16 18.2v.01"/>',
  storm: '<path d="M15 13.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 13.5h9.5z"/><path d="M12.5 13.5 10 17.5h3.5L11 21.5"/>'
};

export const toF = (c: number, useF: boolean) => Math.round(useF ? (c * 9) / 5 + 32 : c);

export async function fetchForecast(p: Place, signal?: AbortSignal): Promise<Forecast> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(p.lat));
  u.searchParams.set('longitude', String(p.lon));
  u.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m');
  u.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  u.searchParams.set('forecast_days', '7');
  u.searchParams.set('timezone', 'auto');

  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();

  const nowIdx = Math.max(0, d.hourly.time.findIndex((x: string) => new Date(x) >= new Date()) - 1);
  return {
    tempC: d.current.temperature_2m,
    feelsC: d.current.apparent_temperature,
    code: d.current.weather_code,
    wind: Math.round(d.current.wind_speed_10m),
    humidity: d.current.relative_humidity_2m,
    hourly: d.hourly.time.slice(nowIdx, nowIdx + 24).map((time: string, i: number) => ({
      time,
      tempC: d.hourly.temperature_2m[nowIdx + i],
      code: d.hourly.weather_code[nowIdx + i],
      precip: d.hourly.precipitation_probability?.[nowIdx + i] ?? 0
    })),
    daily: d.daily.time.map((date: string, i: number) => ({
      date,
      code: d.daily.weather_code[i],
      hiC: d.daily.temperature_2m_max[i],
      loC: d.daily.temperature_2m_min[i]
    }))
  };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.searchParams.set('name', query.trim());
  u.searchParams.set('count', '5');
  const r = await fetch(u, { signal });
  const d = await r.json();
  return (d.results ?? []).map(
    (x: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }) => ({
      name: [x.name, x.admin1, x.country_code].filter(Boolean).join(', '),
      lat: x.latitude,
      lon: x.longitude
    })
  );
}
