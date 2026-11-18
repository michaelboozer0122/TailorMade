/** Dev servers and sideloaded test APKs get extra testing tools; store builds never do. */
export const TEST_BUILD = __DEV__ || process.env.EXPO_PUBLIC_TEST_BUILD === "1";

export const GOOGLE_SIGN_IN_CONFIGURED = !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
