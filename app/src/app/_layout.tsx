import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../components/ui";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
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
        <Stack.Screen name="tailor" options={{ title: "Tailor for a Job" }} />
        <Stack.Screen name="result/[id]" options={{ title: "Tailored Resume" }} />
      </Stack>
    </>
  );
}
