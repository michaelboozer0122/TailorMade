import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { isGoogleSignInAvailable, SignInCancelled, useAuth } from "../lib/auth";
import { Button, colors } from "./ui";

export function SignIn() {
  const auth = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");

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
    <View style={styles.container}>
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
        {isGoogleSignInAvailable() && (
          <Button
            title="Continue with Google"
            variant="secondary"
            loading={busy === "google"}
            disabled={!!busy}
            onPress={() => run("google", auth.signInWithGoogle)}
          />
        )}

        {__DEV__ && (
          <View style={styles.dev}>
            <Text style={styles.devLabel}>Development sign-in (needs ALLOW_DEV_LOGIN=1 on the server)</Text>
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
              onPress={() => run("dev", () => auth.signInDev(devEmail.trim()))}
            />
          </View>
        )}

        <Text style={styles.fine}>
          Free accounts include a set number of tailored resumes each month. Your resume is stored on this device, not
          on our servers.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "space-between" },
  hero: { marginTop: 120, gap: 12 },
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
