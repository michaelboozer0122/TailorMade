import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { Button, Card, colors, SectionTitle } from "../components/ui";
import { useAuth } from "../lib/auth";
import { openManageSubscription } from "../lib/purchases";
import { formatReset } from "../lib/usage";

const PROVIDER_LABEL = { apple: "Apple", google: "Google", dev: "Dev sign-in" } as const;

export default function Account() {
  const { user, usage, refreshUsage, signOut, deleteAccount } = useAuth();
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshUsage().catch(() => {});
    }, [refreshUsage]),
  );

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your TailorMade account and removes your resume and tailored versions from this device. This can't be undone." +
        (usage?.subscription.active
          ? "\n\nDeleting your account does NOT cancel your subscription. Cancel it first under Manage subscription."
          : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
            } catch (e) {
              setDeleting(false);
              Alert.alert("Couldn't delete account", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <SectionTitle>Signed in</SectionTitle>
        <Text style={styles.strong}>{user?.name || user?.email || "Your account"}</Text>
        {!!user?.email && <Text style={styles.muted}>{user.email}</Text>}
        {!!user && <Text style={styles.muted}>via {PROVIDER_LABEL[user.provider]}</Text>}
      </Card>

      {usage && (
        <Card>
          <SectionTitle>Plan · {usage.plan === "pro" ? "Pro" : "Free"}</SectionTitle>
          <Text style={styles.text}>
            Tailored resumes: {usage.tailor.used} of {usage.tailor.limit} used this month
          </Text>
          <Text style={styles.muted}>Resets {formatReset(usage.tailor.resetsAt)}</Text>
          <Text style={[styles.text, { marginTop: 6 }]}>
            Resume uploads: {usage.parse.used} of {usage.parse.limit} today
          </Text>
          {usage.subscription.active ? (
            <>
              {usage.subscription.expiresAt && (
                <Text style={styles.muted}>Subscription renews or ends {formatReset(usage.subscription.expiresAt)}</Text>
              )}
              <Button title="Manage subscription" variant="secondary" onPress={openManageSubscription} />
            </>
          ) : (
            usage.plan === "free" && <Button title="Upgrade to Pro" onPress={() => router.push("/upgrade")} />
          )}
        </Card>
      )}

      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete account" variant="danger" loading={deleting} onPress={confirmDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  strong: { fontSize: 18, fontWeight: "600", color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
});
