export default ({ config }) => ({
  ...config,
  name: 'Zentara Parent',
  slug: 'zentara-parent',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#1a3a5c' },
  ios: { supportsTablet: false, bundleIdentifier: 'com.school.parent' },
  android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1a3a5c' }, package: 'com.school.parent' },
  // Config plugins SDK 57 requires for these packages (expo can't auto-write them into a dynamic config).
  plugins: ['expo-font', 'expo-status-bar'],
  extra: { apiUrl: process.env.API_URL || 'http://localhost:4000', eas: { projectId: '' } },
});
