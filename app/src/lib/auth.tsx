import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as api from "./api";
import { identifyPurchaser, resetPurchaser } from "./purchases";
import { clearAllData, setStorageUser } from "./storage";
import type { AccountUser, Usage } from "./types";

const TOKEN_KEY = "tailormade.session";
const USER_KEY = "tailormade.user";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  user: AccountUser | null;
  usage: Usage | null;
  setUsage: (u: Usage) => void;
  refreshUsage: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDev: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Thrown when the user backs out of a sign-in sheet; callers should ignore it. */
export class SignInCancelled extends Error {}

// Google Sign-In is a native module that Expo Go doesn't include, so load it lazily.
type GoogleModule = typeof import("@react-native-google-signin/google-signin");
let google: GoogleModule | null | undefined;
function loadGoogle(): GoogleModule | null {
  if (google !== undefined) return google;
  try {
    google = require("@react-native-google-signin/google-signin") as GoogleModule;
    google.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
  } catch {
    google = null;
  }
  return google;
}

export const isGoogleSignInAvailable = () => Platform.OS !== "web" && loadGoogle() !== null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  // Keep RevenueCat's user ID in step with the signed-in account.
  useEffect(() => {
    if (user) identifyPurchaser(user.id).catch((e) => console.warn("RevenueCat setup failed", e));
  }, [user]);

  const clearSession = useCallback(async () => {
    await resetPurchaser();
    api.setSessionToken(null);
    setStorageUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
    setUser(null);
    setUsage(null);
    setStatus("signedOut");
  }, []);

  const applySession = useCallback(async (s: api.SessionResponse) => {
    await SecureStore.setItemAsync(TOKEN_KEY, s.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(s.user));
    api.setSessionToken(s.token);
    setStorageUser(s.user.id);
    setUser(s.user);
    setUsage(s.usage);
    setStatus("signedIn");
  }, []);

  // Restore a saved session on launch. Works offline; usage refreshes when the server is reachable.
  useEffect(() => {
    api.setUnauthenticatedHandler(() => void clearSession());
    (async () => {
      await api.loadServerUrl();
      const [token, rawUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY).catch(() => null),
        SecureStore.getItemAsync(USER_KEY).catch(() => null),
      ]);
      if (!token || !rawUser) return setStatus("signedOut");
      const saved = JSON.parse(rawUser) as AccountUser;
      api.setSessionToken(token);
      setStorageUser(saved.id);
      setUser(saved);
      setStatus("signedIn");
      api.getMe().then((me) => setUsage(me.usage), () => {});
    })();
    return () => api.setUnauthenticatedHandler(null);
  }, [clearSession]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      usage,
      setUsage,
      refreshUsage: async () => {
        const me = await api.getMe();
        setUsage(me.usage);
      },
      signInWithApple: async () => {
        let credential: AppleAuthentication.AppleAuthenticationCredential;
        try {
          credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });
        } catch (e) {
          if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new SignInCancelled();
          throw e;
        }
        if (!credential.identityToken) throw new Error("Apple didn't return a sign-in token.");
        const fullName = credential.fullName
          ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
          : "";
        await applySession(await api.signInWithAppleToken(credential.identityToken, fullName));
      },
      signInWithGoogle: async () => {
        const g = loadGoogle();
        if (!g) throw new Error("Google sign-in needs a development or store build (it isn't available in Expo Go).");
        try {
          if (Platform.OS === "android") await g.GoogleSignin.hasPlayServices();
          const res = await g.GoogleSignin.signIn();
          if (!g.isSuccessResponse(res)) throw new SignInCancelled();
          if (!res.data.idToken) throw new Error("Google didn't return a sign-in token. Check the web client ID.");
          await applySession(await api.signInWithGoogleToken(res.data.idToken));
        } catch (e) {
          if (g.isErrorWithCode(e) && e.code === g.statusCodes.SIGN_IN_CANCELLED) throw new SignInCancelled();
          throw e;
        }
      },
      signInDev: async (email: string) => {
        await applySession(await api.signInDev(email));
      },
      signOut: async () => {
        if (user?.provider === "google") await loadGoogle()?.GoogleSignin.signOut().catch(() => {});
        await clearSession();
      },
      deleteAccount: async () => {
        await api.deleteAccount();
        await clearAllData();
        if (user?.provider === "google") await loadGoogle()?.GoogleSignin.revokeAccess().catch(() => {});
        await clearSession();
      },
    }),
    [status, user, usage, applySession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
