import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SignIn } from "../components/SignIn";
import { colors } from "../components/ui";
import { AuthProvider, useAuth } from "../lib/auth";

function Root() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (status === "signedOut") return <SignIn />;

  return (
    // Keyed by user so screens remount (and reload that user's data) after switching accounts.
    <Stack
      key={user?.id}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: "TailorMade" }} />
      <Stack.Screen name="profile" options={{ title: "My Resume" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
      <Stack.Screen name="tailor" options={{ title: "Tailor for a Job" }} />
      <Stack.Screen name="result/[id]" options={{ title: "Tailored Resume" }} />
      <Stack.Screen name="upgrade" options={{ title: "Upgrade", presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Root />
    </AuthProvider>
  );
}
