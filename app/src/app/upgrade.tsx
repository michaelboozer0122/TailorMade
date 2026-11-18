import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Card, colors } from "../components/ui";
import { getPlans, syncBilling, type PlanLimits } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  buyPackage,
  getProPackages,
  openManageSubscription,
  periodLabel,
  purchasesAvailable,
  restorePurchases,
  type ProPackage,
} from "../lib/purchases";
import type { Usage } from "../lib/types";

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "";
// Apple's standard EULA unless you publish your own terms.
const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ?? "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Upgrade() {
  const { usage, setUsage } = useAuth();
  const [packages, setPackages] = useState<ProPackage[] | null>(null);
  const [selected, setSelected] = useState<ProPackage | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanLimits> | null>(null);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then((r) => setPlans(r.plans), () => {});
    if (!purchasesAvailable()) {
      setLoadError("Subscriptions aren't available in this build. Install the app from the App Store or Google Play.");
      setPackages([]);
      return;
    }
    getProPackages().then(
      (pkgs) => {
        setPackages(pkgs);
        // Pre-select the yearly plan if there is one (usually the best value), else the first.
        setSelected(pkgs.find((p) => p.packageType === "ANNUAL") ?? pkgs[0] ?? null);
        if (!pkgs.length) setLoadError("No subscription plans are available right now. Please try again later.");
      },
      (e) => {
        setPackages([]);
        setLoadError(e instanceof Error ? e.message : "Couldn't load subscription plans.");
      },
    );
  }, []);

  /** The store confirms instantly, but the server may take a moment to see it. */
  async function syncUntilPro(): Promise<Usage> {
    let latest = (await syncBilling()).usage;
    for (let i = 0; i < 3 && latest.plan === "free"; i++) {
      await sleep(1500);
      latest = (await syncBilling()).usage;
    }
    setUsage(latest);
    return latest;
  }

  async function buy() {
    if (!selected) return;
    setBusy("buy");
    try {
      if (!(await buyPackage(selected))) return; // cancelled
      const latest = await syncUntilPro();
      if (latest.plan === "free") {
        Alert.alert("Purchase received", "Your Pro access will appear in a minute. Pull to refresh or reopen the app.");
      } else {
        Alert.alert("You're on Pro", `You now have ${latest.tailor.remaining} tailored resumes left this month.`);
      }
      router.back();
    } catch (e) {
      Alert.alert("Purchase failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      await restorePurchases();
      const latest = await syncUntilPro();
      Alert.alert(
        latest.plan === "free" ? "Nothing to restore" : "Restored",
        latest.plan === "free"
          ? "We didn't find an active subscription for this store account."
          : "Your Pro subscription is active again.",
      );
      if (latest.plan !== "free") router.back();
    } catch (e) {
      Alert.alert("Restore failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const free = plans?.free;
  const pro = plans?.pro;
  const isSubscribed = usage?.subscription.active;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>TailorMade Pro</Text>
        <Text style={styles.subtitle}>Tailor your resume for every job you apply to.</Text>
      </View>

      <Card>
        <Feature text={pro ? `${pro.tailorPerMonth} tailored resumes per month` : "Many more tailored resumes per month"} />
        {free && <Text style={styles.compare}>Free plan: {free.tailorPerMonth} per month</Text>}
        <Feature text="A tailored cover letter with every resume" />
        <Feature text={pro ? `Up to ${pro.parsePerDay} resume uploads per day` : "More resume uploads"} />
        <Feature text="Cancel any time" />
      </Card>

      {isSubscribed ? (
        <Card>
          <Text style={styles.strong}>You're subscribed to Pro.</Text>
          <Button title="Manage subscription" variant="secondary" onPress={openManageSubscription} />
        </Card>
      ) : packages === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : (
        <>
          {loadError && <Text style={styles.error}>{loadError}</Text>}
          {packages.map((pkg) => {
            const active = selected?.identifier === pkg.identifier;
            const period = periodLabel(pkg);
            return (
              <Pressable
                key={pkg.identifier}
                onPress={() => setSelected(pkg)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.pkg, active && styles.pkgActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{pkg.product.title || `Pro (${period})`}</Text>
                  {pkg.packageType === "ANNUAL" && pkg.product.pricePerMonthString && (
                    <Text style={styles.muted}>{pkg.product.pricePerMonthString} / month, billed yearly</Text>
                  )}
                  {pkg.product.introPrice && (
                    <Text style={styles.good}>
                      {pkg.product.introPrice.price === 0 ? "Free trial" : "Intro offer"}:{" "}
                      {pkg.product.introPrice.priceString} for {pkg.product.introPrice.periodNumberOfUnits}{" "}
                      {pkg.product.introPrice.periodUnit.toLowerCase()}
                      {pkg.product.introPrice.periodNumberOfUnits > 1 ? "s" : ""}
                    </Text>
                  )}
                </View>
                <Text style={styles.price}>
                  {pkg.product.priceString}
                  {period && period !== "lifetime" ? ` / ${period}` : ""}
                </Text>
              </Pressable>
            );
          })}

          {packages.length > 0 && (
            <Button
              title={busy === "buy" ? "Processing…" : "Subscribe"}
              onPress={buy}
              loading={busy === "buy"}
              disabled={!selected || !!busy}
            />
          )}
          {purchasesAvailable() && (
            <Button title="Restore purchases" variant="secondary" onPress={restore} loading={busy === "restore"} disabled={!!busy} />
          )}
        </>
      )}

      {/* Apple and Google require these disclosures next to the purchase button. */}
      <Text style={styles.legal}>
        Payment is charged to your {Platform.OS === "ios" ? "Apple ID" : "Google Play"} account. The subscription renews
        automatically at the same price and period unless cancelled at least 24 hours before the end of the current
        period. Manage or cancel any time in your {Platform.OS === "ios" ? "App Store" : "Google Play"} account settings.
      </Text>
      <View style={styles.links}>
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
          Terms of Use
        </Text>
        {!!PRIVACY_URL && (
          <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Text style={{ color: colors.good, fontSize: 16 }}>✓</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted },
  text: { fontSize: 15, color: colors.text, flex: 1 },
  strong: { fontSize: 16, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  good: { fontSize: 13, color: colors.good, marginTop: 2 },
  compare: { fontSize: 13, color: colors.muted, marginLeft: 24, marginTop: -4 },
  error: { color: colors.danger, fontSize: 14 },
  pkg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pkgActive: { borderColor: colors.primary },
  price: { fontSize: 16, fontWeight: "700", color: colors.text },
  legal: { fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  links: { flexDirection: "row", gap: 20, justifyContent: "center" },
  link: { color: colors.primary, fontSize: 13, fontWeight: "600" },
});
