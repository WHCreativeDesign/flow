import { instance } from './sync';
import { idb } from './storage/idb';
import { codeOf, type Forecast, type Place } from './data/weather';

/*
  Glance notifications.

  These are read out of real instance state — notes, threads, captures, the
  library, and the actual forecast. Nothing here is invented: if the instance
  is empty, the glance says so rather than showing a plausible-looking feed.
*/
export interface Note {
  id: string;
  kind: 'weather' | 'notes' | 'messages' | 'camera' | 'music';
  title: string;
  body: string;
  /** the app an orb press should open */
  app: string;
  at?: number;
  /** weather only: which glyph the condition maps to */
  glyph?: string;
}

interface StoredNote {
  id: string;
  text: string;
  updated: number;
}
interface StoredThread {
  id: string;
  name: string;
  msgs: { text: string; at: number }[];
}

function weatherNote(wx: Forecast, place: Place): Note | null {
  // a real alert or nothing — the next wet hour, read from the forecast
  const wet = wx.hourly.slice(1, 13).find((h) => h.precip >= 50);
  if (wet) {
    const when = new Date(wet.time).toLocaleTimeString([], { hour: 'numeric' }).toLowerCase().replace(' ', '');
    return {
      id: 'wx-precip',
      kind: 'weather',
      title: `${codeOf(wet.code).label} around ${when}`,
      body: `${wet.precip}% chance in ${place.name.split(',')[0].toLowerCase()}`,
      app: 'weather',
      glyph: codeOf(wet.code).glyph
    };
  }
  return {
    id: 'wx-now',
    kind: 'weather',
    title: `${Math.round(wx.tempC)}° and ${codeOf(wx.code).label}`,
    body: `feels ${Math.round(wx.feelsC)}° in ${place.name.split(',')[0].toLowerCase()}`,
    app: 'weather',
    glyph: codeOf(wx.code).glyph
  };
}

export async function collect(): Promise<Note[]> {
  const out: Note[] = [];

  const [notesState, msgState, weatherState] = await Promise.all([
    instance.getAppState('notes'),
    instance.getAppState('messages'),
    instance.getAppState('weather')
  ]);

  const place = weatherState?.place as Place | undefined;
  if (place) {
    try {
      const { fetchForecast } = await import('./data/weather');
      const wx = await fetchForecast(place);
      const n = weatherNote(wx, place);
      if (n) out.push(n);
    } catch {
      /* offline: the glance simply carries no weather line */
    }
  }

  const threads = (msgState?.threads as StoredThread[] | undefined) ?? [];
  const latest = threads
    .flatMap((t) => t.msgs.map((m) => ({ thread: t.name, ...m })))
    .sort((a, b) => b.at - a.at)[0];
  if (latest) {
    out.push({
      id: 'msg-latest',
      kind: 'messages',
      title: latest.thread,
      body: latest.text,
      app: 'messages',
      at: latest.at
    });
  }

  const notes = (notesState?.notes as StoredNote[] | undefined) ?? [];
  const recent = [...notes].sort((a, b) => b.updated - a.updated)[0];
  if (recent) {
    out.push({
      id: 'note-recent',
      kind: 'notes',
      title: recent.text.trim().split('\n')[0] || 'untitled',
      body: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} on this instance`,
      app: 'notes',
      at: recent.updated
    });
  }

  try {
    const [photos, tracks] = await Promise.all([idb.keys('photos'), idb.keys('tracks')]);
    if (photos.length) {
      out.push({
        id: 'cam-count',
        kind: 'camera',
        title: `${photos.length} ${photos.length === 1 ? 'capture' : 'captures'}`,
        body: 'in your gallery',
        app: 'camera',
        at: Number(photos[photos.length - 1])
      });
    }
    if (tracks.length) {
      out.push({
        id: 'music-count',
        kind: 'music',
        title: `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`,
        body: 'in your library',
        app: 'music'
      });
    }
  } catch {
    /* storage unavailable */
  }

  return out;
}
