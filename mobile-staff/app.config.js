export default ({ config }) => ({
  ...config,
  name: 'School Staff',
  slug: 'school-staff',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#1a3a5c' },
  ios: { supportsTablet: false, bundleIdentifier: 'com.school.staff' },
  android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1a3a5c' }, package: 'com.school.staff' },
  extra: { apiUrl: process.env.API_URL || 'http://192.168.1.65:4000/api', eas: { projectId: '' } },
});
