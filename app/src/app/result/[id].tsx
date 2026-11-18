import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Button, Card, Chip, colors, SectionTitle } from "../../components/ui";
import { sharePdf } from "../../lib/exportPdf";
import { coverLetterToHtml, resumeToHtml } from "../../lib/resumeHtml";
import { deleteHistoryItem, getHistoryItem } from "../../lib/storage";
import type { HistoryItem } from "../../lib/types";

type Tab = "resume" | "fit" | "letter";

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<HistoryItem | null>(null);
  const [tab, setTab] = useState<Tab>("resume");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (id) getHistoryItem(id).then((h) => setItem(h ?? null));
  }, [id]);

  if (!item) return null;
  const { result } = item;
  const r = result.resume;

  async function exportResume() {
    setExporting(true);
    try {
      await sharePdf(resumeToHtml(r), "Save tailored resume");
    } catch (e) {
      Alert.alert("Export failed", e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  function remove() {
    Alert.alert("Delete this version?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteHistoryItem(item!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{result.jobTitle || "Target job"}</Text>
          {!!result.company && <Text style={styles.muted}>{result.company}</Text>}
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.score}>{Math.round(result.matchScore)}%</Text>
          <Text style={styles.scoreLabel}>match</Text>
        </View>
      </Card>

      <View style={styles.tabs}>
        {(
          [
            ["resume", "Resume"],
            ["fit", "Job fit"],
            ["letter", "Cover letter"],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === key && { color: colors.primaryText }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "resume" && (
        <>
          <Card>
            <Text style={styles.name}>{r.name}</Text>
            {!!r.headline && <Text style={styles.strong}>{r.headline}</Text>}
            <Text style={styles.muted}>
              {[r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links].filter(Boolean).join(" · ")}
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
                <View key={i} style={{ marginTop: 8, gap: 2 }}>
                  <Text style={styles.strong}>{e.title}</Text>
                  <Text style={styles.muted}>
                    {[e.company, e.location].filter(Boolean).join(", ")} · {[e.start, e.end].filter(Boolean).join(" – ")}
                  </Text>
                  {e.bullets.map((b, j) => (
                    <Text key={j} style={styles.bullet}>
                      • {b}
                    </Text>
                  ))}
                </View>
              ))}
            </Card>
          )}
          {r.projects.length > 0 && (
            <Card>
              <SectionTitle>Projects</SectionTitle>
              {r.projects.map((p, i) => (
                <View key={i} style={{ marginTop: 6 }}>
                  <Text style={styles.strong}>{p.name}</Text>
                  {!!p.description && <Text style={styles.text}>{p.description}</Text>}
                  {p.bullets.map((b, j) => (
                    <Text key={j} style={styles.bullet}>
                      • {b}
                    </Text>
                  ))}
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
                  {e.end ? ` (${e.end})` : ""}
                </Text>
              ))}
            </Card>
          )}
          {r.certifications.length > 0 && (
            <Card>
              <SectionTitle>Certifications</SectionTitle>
              {r.certifications.map((c, i) => (
                <Text key={i} style={styles.bullet}>
                  • {c}
                </Text>
              ))}
            </Card>
          )}
          <Button title="Export resume as PDF" onPress={exportResume} loading={exporting} />
        </>
      )}

      {tab === "fit" && (
        <>
          <Card>
            <SectionTitle>You already match</SectionTitle>
            <View style={styles.chips}>
              {result.matchedKeywords.map((k) => (
                <Chip key={k} label={k} tone="good" />
              ))}
            </View>
          </Card>
          {result.missingKeywords.length > 0 && (
            <Card>
              <SectionTitle>Gaps to address</SectionTitle>
              <Text style={styles.muted}>
                Not on your resume, so we didn't add them. If you do have these, add them to your base resume and
                re-upload — or mention them in an interview.
              </Text>
              <View style={styles.chips}>
                {result.missingKeywords.map((k) => (
                  <Chip key={k} label={k} tone="warn" />
                ))}
              </View>
            </Card>
          )}
          <Card>
            <SectionTitle>What we changed</SectionTitle>
            {result.changes.map((c, i) => (
              <Text key={i} style={styles.bullet}>
                • {c}
              </Text>
            ))}
          </Card>
        </>
      )}

      {tab === "letter" && (
        <>
          <Card>
            <Text style={styles.text} selectable>
              {result.coverLetter}
            </Text>
          </Card>
          <Button title="Share / copy text" variant="secondary" onPress={() => Share.share({ message: result.coverLetter })} />
          <Button
            title="Export cover letter as PDF"
            onPress={() => sharePdf(coverLetterToHtml(result.coverLetter, r.name), "Save cover letter")}
          />
        </>
      )}

      <Text style={styles.disclaimer}>
        AI can make mistakes. Review everything before you send it — you're responsible for what's on your resume.
      </Text>
      <Button title="Delete this version" variant="danger" onPress={remove} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  scoreBox: { alignItems: "center", marginLeft: 12 },
  score: { fontSize: 26, fontWeight: "800", color: colors.primary },
  scoreLabel: { fontSize: 12, color: colors.muted },
  tabs: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.text },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  strong: { fontSize: 15, fontWeight: "600", color: colors.text },
  text: { fontSize: 15, color: colors.text, lineHeight: 22 },
  bullet: { fontSize: 14.5, color: colors.text, lineHeight: 21, paddingLeft: 4 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  disclaimer: { fontSize: 12, color: colors.muted, textAlign: "center" },
});
