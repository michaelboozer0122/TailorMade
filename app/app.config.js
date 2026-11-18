// Extends app.json. Test builds (EXPO_PUBLIC_TEST_BUILD=1) are for sideloading onto your own phone:
// they show a server-address field and email test sign-in, and allow plain-HTTP connections
// so the app can reach a server running on your computer over Wi-Fi.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_TEST_BUILD !== "1") return config;
  return {
    ...config,
    name: `${config.name} Test`,
    plugins: [...(config.plugins ?? []), ["expo-build-properties", { android: { usesCleartextTraffic: true } }]],
  };
};
