import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, colors, SectionTitle } from "../components/ui";
import { tailor } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isQuotaError } from "../lib/usage";
import { addHistoryItem, loadProfile } from "../lib/storage";

type Mode = "link" | "text" | "title";

const MODES: { key: Mode; label: string }[] = [
  { key: "link", label: "Job link" },
  { key: "text", label: "Paste description" },
  { key: "title", label: "Job title only" },
];

export default function Tailor() {
  const [mode, setMode] = useState<Mode>("link");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const { usage, setUsage, refreshUsage } = useAuth();
  const outOfTailors = usage ? usage.tailor.remaining <= 0 : false;

  const canSubmit =
    (mode === "link" && /^https?:\/\/\S+\.\S+/.test(jobUrl.trim())) ||
    (mode === "text" && jobText.trim().length > 50) ||
    (mode === "title" && jobTitle.trim().length > 1);

  async function submit() {
    const profile = await loadProfile();
    if (!profile) {
      router.replace("/profile");
      return;
    }
    setBusy(true);
    try {
      const { result, jobDescription, usage } = await tailor({
        profile: profile.resume,
        jobUrl: mode === "link" ? jobUrl.trim() : undefined,
        jobText: mode === "text" ? jobText.trim() : undefined,
        jobTitle: jobTitle.trim() || undefined,
      });
      setUsage(usage);
      const id = `${Date.now()}`;
      await addHistoryItem({
        id,
        createdAt: Date.now(),
        jobUrl: mode === "link" ? jobUrl.trim() : undefined,
        jobTitleInput: jobTitle.trim() || undefined,
        jobDescription,
        result,
      });
      router.replace(`/result/${id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isQuotaError(e)) {
        refreshUsage().catch(() => {});
        Alert.alert("Monthly limit reached", message, [
          { text: "OK", style: "cancel" },
          { text: "See Pro", onPress: () => router.push("/upgrade") },
        ]);
      } else if (mode === "link") {
        Alert.alert("Couldn't use that link", message, [
          { text: "OK" },
          { text: "Paste description instead", onPress: () => setMode("text") },
        ]);
      } else {
        Alert.alert("Something went wrong", message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[styles.segmentItem, mode === m.key && styles.segmentActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m.key }}
            >
              <Text style={[styles.segmentText, mode === m.key && { color: colors.primaryText }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <Card>
          {mode === "link" && (
            <>
              <SectionTitle>Job listing URL</SectionTitle>
              <TextInput
                style={styles.input}
                placeholder="https://company.com/careers/job-123"
                value={jobUrl}
                onChangeText={setJobUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                inputMode="url"
              />
              <Text style={styles.hint}>
                Works with most company career pages, Greenhouse, Lever, Workday and Indeed. LinkedIn usually needs
                login — paste the description instead.
              </Text>
            </>
          )}

          {mode === "text" && (
            <>
              <SectionTitle>Job description</SectionTitle>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Paste the full job posting here…"
                value={jobText}
                onChangeText={setJobText}
                multiline
                textAlignVertical="top"
              />
            </>
          )}

          <SectionTitle>{mode === "title" ? "Job title" : "Target title (optional)"}</SectionTitle>
          <TextInput
            style={styles.input}
            placeholder="e.g. Senior Product Designer"
            value={jobTitle}
            onChangeText={setJobTitle}
          />
        </Card>

        <Button title={busy ? "Tailoring…" : "Tailor my resume"} onPress={submit} loading={busy} disabled={!canSubmit || outOfTailors} />
        {usage && (
          <Text style={styles.hint}>
            {outOfTailors
              ? "You've used all your tailored resumes for this month."
              : `Uses 1 of your ${usage.tailor.remaining} remaining tailored resumes this month. Failed attempts don't count.`}
          </Text>
        )}
        {busy && <Text style={styles.hint}>This usually takes 30–90 seconds. Keep the app open.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  segment: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 13, fontWeight: "600", color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: "#FAFBFF",
  },
  multiline: { minHeight: 200 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
