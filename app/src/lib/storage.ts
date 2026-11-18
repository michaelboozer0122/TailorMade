import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HistoryItem, StoredProfile } from "./types";

// Resume data lives only on the device, stored separately per signed-in account
// so a shared phone never shows one person's resume to another.
const MAX_HISTORY = 50;
let userId = "anonymous";

export function setStorageUser(id: string | null) {
  userId = id ?? "anonymous";
}

const profileKey = () => `tailormade.${userId}.profile.v1`;
const historyKey = () => `tailormade.${userId}.history.v1`;

export async function loadProfile(): Promise<StoredProfile | null> {
  const raw = await AsyncStorage.getItem(profileKey());
  return raw ? (JSON.parse(raw) as StoredProfile) : null;
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await AsyncStorage.setItem(profileKey(), JSON.stringify(profile));
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(historyKey());
  return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
}

export async function getHistoryItem(id: string): Promise<HistoryItem | undefined> {
  return (await loadHistory()).find((h) => h.id === id);
}

export async function addHistoryItem(item: HistoryItem): Promise<void> {
  const history = await loadHistory();
  await AsyncStorage.setItem(historyKey(), JSON.stringify([item, ...history].slice(0, MAX_HISTORY)));
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const history = await loadHistory();
  await AsyncStorage.setItem(historyKey(), JSON.stringify(history.filter((h) => h.id !== id)));
}

/** Removes the current account's resume and history from this device. */
export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([profileKey(), historyKey()]);
}
