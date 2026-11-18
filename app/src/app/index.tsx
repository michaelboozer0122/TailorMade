import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, colors, SectionTitle } from "../components/ui";
import { loadHistory, loadProfile } from "../lib/storage";
import type { HistoryItem, StoredProfile } from "../lib/types";

export default function Home() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadProfile().then(setProfile);
      loadHistory().then(setHistory);
    }, []),
  );

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={history}
      keyExtractor={(h) => h.id}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={styles.tagline}>
            Upload your resume once. Get a version tailored to every job you apply for.
          </Text>

          <Card>
            <SectionTitle>Step 1 · Your resume</SectionTitle>
            {profile ? (
              <>
                <Text style={styles.big}>{profile.resume.name || "Your resume"}</Text>
                <Text style={styles.muted}>
                  From {profile.sourceFileName} · {profile.resume.experience.length} roles ·{" "}
                  {profile.resume.skills.length} skills
                </Text>
                <Button title="View or replace" variant="secondary" onPress={() => router.push("/profile")} />
              </>
            ) : (
              <>
                <Text style={styles.muted}>Upload a PDF of your general resume. We'll read it once and keep it on this device.</Text>
                <Button title="Upload resume PDF" onPress={() => router.push("/profile")} />
              </>
            )}
          </Card>

          <Card>
            <SectionTitle>Step 2 · Pick a job</SectionTitle>
            <Text style={styles.muted}>Paste a job link, the job description, or just a job title.</Text>
            <Button title="Tailor my resume" disabled={!profile} onPress={() => router.push("/tailor")} />
          </Card>

          {history.length > 0 && <SectionTitle>Recent</SectionTitle>}
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/result/${item.id}`)}>
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.result.jobTitle || item.jobTitleInput || "Job"}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[item.result.company, new Date(item.createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Text style={styles.score}>{Math.round(item.result.matchScore)}%</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 0, paddingBottom: 48 },
  tagline: { fontSize: 17, color: colors.text, lineHeight: 24 },
  big: { fontSize: 20, fontWeight: "700", color: colors.text },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  score: { fontSize: 18, fontWeight: "700", color: colors.primary },
});
