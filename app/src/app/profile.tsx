import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, colors, SectionTitle } from "../components/ui";
import { parseResume } from "../lib/api";
import { useAuth } from "../lib/auth";
import { clearAllData, loadProfile, saveProfile } from "../lib/storage";
import type { StoredProfile } from "../lib/types";

export default function Profile() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const { setUsage } = useAuth();

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  async function pickAndUpload() {
    const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > 10 * 1024 * 1024) {
      Alert.alert("File too large", "Please choose a PDF under 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const { profile: resume, usage } = await parseResume(file);
      setUsage(usage);
      const stored: StoredProfile = { resume, sourceFileName: file.name, updatedAt: Date.now() };
      await saveProfile(stored);
      setProfile(stored);
    } catch (e) {
      Alert.alert("Couldn't read resume", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Remove from this device?", "This removes your resume and every tailored version from this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await clearAllData();
          setProfile(null);
          router.replace("/");
        },
      },
    ]);
  }

  const r = profile?.resume;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.muted}>
          {busy
            ? "Reading your resume… this can take up to a minute."
            : r
              ? `Loaded from ${profile.sourceFileName}. Upload a newer PDF any time.`
              : "Choose the PDF of your general, all-purpose resume."}
        </Text>
        <Button title={r ? "Replace resume PDF" : "Choose PDF"} onPress={pickAndUpload} loading={busy} />
      </Card>

      {r && (
        <>
          <Card>
            <Text style={styles.name}>{r.name}</Text>
            {!!r.headline && <Text style={styles.text}>{r.headline}</Text>}
            <Text style={styles.muted}>
              {[r.contact.email, r.contact.phone, r.contact.location].filter(Boolean).join(" · ")}
            </Text>
            {!!r.summary && <Text style={styles.text}>{r.summary}</Text>}
          </Card>

          {r.skills.length > 0 && (
            <Card>
              <SectionTitle>Skills</SectionTitle>
              <Text style={styles.text}>{r.skills.join(" · ")}</Text>
            </Card>
          )}

          {r.experience.length > 0 && (
            <Card>
              <SectionTitle>Experience</SectionTitle>
              {r.experience.map((e, i) => (
                <View key={i} style={{ marginTop: 6 }}>
                  <Text style={styles.strong}>
                    {e.title} · {e.company}
                  </Text>
                  <Text style={styles.muted}>{[e.start, e.end].filter(Boolean).join(" – ")}</Text>
                </View>
              ))}
            </Card>
          )}

          {r.education.length > 0 && (
            <Card>
              <SectionTitle>Education</SectionTitle>
              {r.education.map((e, i) => (
                <Text key={i} style={styles.text}>
                  {[e.degree, e.field].filter(Boolean).join(", ")} — {e.school}
                </Text>
              ))}
            </Card>
          )}

          <Button title="Tailor for a job →" onPress={() => router.push("/tailor")} />
          <Button title="Remove resume from this device" variant="danger" onPress={confirmDelete} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  text: { fontSize: 15, color: colors.text, lineHeight: 22 },
  strong: { fontSize: 15, fontWeight: "600", color: colors.text },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
