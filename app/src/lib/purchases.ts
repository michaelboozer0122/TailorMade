import { Linking, Platform } from "react-native";

// RevenueCat wraps App Store / Google Play billing. These are public SDK keys (safe to ship).
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

// Native module; not in Expo Go, so load lazily.
type PurchasesModule = typeof import("react-native-purchases");
let mod: PurchasesModule | null | undefined;
function load(): PurchasesModule | null {
  if (mod !== undefined) return mod;
  try {
    mod = Platform.OS === "web" || !API_KEY ? null : (require("react-native-purchases") as PurchasesModule);
  } catch {
    mod = null;
  }
  return mod;
}

export const purchasesAvailable = () => load() !== null;

let configuredFor: string | null = null;

/** Ties purchases to our account ID, so the server can look up the subscription by user ID. */
export async function identifyPurchaser(userId: string): Promise<void> {
  const m = load();
  if (!m || configuredFor === userId) return;
  const Purchases = m.default;
  if (configuredFor === null && !(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey: API_KEY!, appUserID: userId });
  } else {
    await Purchases.logIn(userId);
  }
  configuredFor = userId;
}

export async function resetPurchaser(): Promise<void> {
  const m = load();
  if (!m || configuredFor === null) return;
  await m.default.logOut().catch(() => {});
  configuredFor = null;
}

export type ProPackage = import("react-native-purchases").PurchasesPackage;

/** The packages (e.g. monthly, annual) in the "current" offering set up in the RevenueCat dashboard. */
export async function getProPackages(): Promise<ProPackage[]> {
  const m = load();
  if (!m) return [];
  const offerings = await m.default.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/** Returns false if the user cancelled the store sheet. */
export async function buyPackage(pkg: ProPackage): Promise<boolean> {
  const m = load();
  if (!m) throw new Error("Purchases aren't available in this build.");
  try {
    await m.default.purchasePackage(pkg);
    return true;
  } catch (e) {
    const err = e as { userCancelled?: boolean | null; code?: string };
    if (err.userCancelled || err.code === m.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    throw e;
  }
}

export async function restorePurchases(): Promise<void> {
  const m = load();
  if (!m) throw new Error("Purchases aren't available in this build.");
  await m.default.restorePurchases();
}

/** Opens the store's subscription management page (cancel, change plan). */
export async function openManageSubscription(): Promise<void> {
  const m = load();
  const url =
    (m && (await m.default.getCustomerInfo().catch(() => null))?.managementURL) ||
    (Platform.OS === "ios"
      ? "https://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions");
  await Linking.openURL(url);
}

/** Human-readable billing period, e.g. "month" or "year". */
export function periodLabel(pkg: ProPackage): string {
  switch (pkg.packageType) {
    case "ANNUAL":
      return "year";
    case "SIX_MONTH":
      return "6 months";
    case "THREE_MONTH":
      return "3 months";
    case "TWO_MONTH":
      return "2 months";
    case "MONTHLY":
      return "month";
    case "WEEKLY":
      return "week";
    case "LIFETIME":
      return "lifetime";
    default:
      return pkg.product.subscriptionPeriod ?? "";
  }
}
