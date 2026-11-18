import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getServerUrl, setServerUrl } from "../lib/api";
import { isGoogleSignInAvailable, SignInCancelled, useAuth } from "../lib/auth";
import { GOOGLE_SIGN_IN_CONFIGURED, TEST_BUILD } from "../lib/config";
import { Button, colors } from "./ui";

export function SignIn() {
  const auth = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");
  const [server, setServer] = useState(getServerUrl());

  useEffect(() => {
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof SignInCancelled)) {
        Alert.alert("Sign-in failed", e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.logo}>TailorMade</Text>
        <Text style={styles.tagline}>A resume tailored to every job you apply for.</Text>
      </View>

      <View style={styles.buttons}>
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={{ height: 50, opacity: busy ? 0.5 : 1 }}
            onPress={() => !busy && run("apple", auth.signInWithApple)}
          />
        )}
        {GOOGLE_SIGN_IN_CONFIGURED && isGoogleSignInAvailable() && (
          <Button
            title="Continue with Google"
            variant="secondary"
            loading={busy === "google"}
            disabled={!!busy}
            onPress={() => run("google", auth.signInWithGoogle)}
          />
        )}

        {TEST_BUILD && (
          <View style={styles.dev}>
            <Text style={styles.devLabel}>Test build · server address</Text>
            <TextInput
              style={styles.input}
              placeholder="http://192.168.1.10:8787"
              value={server}
              onChangeText={setServer}
              onEndEditing={() => setServerUrl(server)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.devLabel}>Test sign-in (needs ALLOW_DEV_LOGIN=1 on the server)</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              value={devEmail}
              onChangeText={setDevEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button
              title="Dev sign-in"
              variant="secondary"
              loading={busy === "dev"}
              disabled={!!busy || !devEmail.includes("@")}
              onPress={() =>
                run("dev", async () => {
                  await setServerUrl(server);
                  await auth.signInDev(devEmail.trim());
                })
              }
            />
          </View>
        )}

        <Text style={styles.fine}>
          Free accounts include a set number of tailored resumes each month. Your resume is stored on this device, not
          on our servers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "space-between", gap: 32 },
  hero: { marginTop: 96, gap: 12 },
  logo: { fontSize: 40, fontWeight: "800", color: colors.primary },
  tagline: { fontSize: 18, color: colors.text, lineHeight: 26 },
  buttons: { gap: 12, marginBottom: 32 },
  dev: { gap: 8, marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  devLabel: { fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.card,
    color: colors.text,
  },
  fine: { fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 17 },
});
