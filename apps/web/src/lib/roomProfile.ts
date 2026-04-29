import type { Language } from "@babel-room/shared";

const STORAGE_KEY = "babel-room:last-join-profile";

export interface RoomJoinProfile {
  displayName: string;
  sourceLang: Language;
  targetLang: Language;
}

export function loadRoomProfile(): RoomJoinProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const displayName = String(o.displayName ?? "").trim();
    const sourceLang = o.sourceLang as Language;
    const targetLang = o.targetLang as Language;
    if (!displayName || !sourceLang || !targetLang) return null;
    return { displayName, sourceLang, targetLang };
  } catch {
    return null;
  }
}

export function saveRoomProfile(p: RoomJoinProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* quota / private mode */
  }
}
