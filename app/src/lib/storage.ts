import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HistoryItem, StoredProfile } from "./types";

// All resume data lives only on the device. The server is stateless.
const PROFILE_KEY = "tailormade.profile.v1";
const HISTORY_KEY = "tailormade.history.v1";
const MAX_HISTORY = 50;

export async function loadProfile(): Promise<StoredProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as StoredProfile) : null;
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function loadHistory(): Promise<HistoryItem[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
}

export async function getHistoryItem(id: string): Promise<HistoryItem | undefined> {
  return (await loadHistory()).find((h) => h.id === id);
}

export async function addHistoryItem(item: HistoryItem): Promise<void> {
  const history = await loadHistory();
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...history].slice(0, MAX_HISTORY)));
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const history = await loadHistory();
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.filter((h) => h.id !== id)));
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([PROFILE_KEY, HISTORY_KEY]);
}
