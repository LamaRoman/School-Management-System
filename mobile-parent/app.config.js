export default ({ config }) => ({
  ...config,
  name: 'School Parent',
  slug: 'school-parent',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#1a3a5c' },
  ios: { supportsTablet: false, bundleIdentifier: 'com.school.parent' },
  android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1a3a5c' }, package: 'com.school.parent' },
  extra: { apiUrl: process.env.API_URL || 'http://localhost:4000', eas: { projectId: '' } },
});
