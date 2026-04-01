#!/bin/bash
# Run from: ~/Desktop/School-Management-System
# Creates mobile-staff/ and mobile-parent/ by copying from mobile/

set -e
cd ~/Desktop/School-Management-System

echo "Creating mobile-staff and mobile-parent..."

# ── Create directories ────────────────────────────────────
for app in mobile-staff mobile-parent; do
  mkdir -p $app/src/api
  mkdir -p $app/src/components
  mkdir -p $app/src/hooks
  mkdir -p $app/src/navigation
  mkdir -p $app/src/theme
  mkdir -p $app/src/screens/auth
  mkdir -p $app/src/screens/shared
  mkdir -p $app/assets
done
mkdir -p mobile-staff/src/screens/teacher
mkdir -p mobile-staff/src/screens/accountant
mkdir -p mobile-parent/src/screens/parent
mkdir -p mobile-parent/src/screens/student

# ── Copy shared files into STAFF ─────────────────────────
cp mobile/babel.config.js mobile-staff/
cp mobile/tsconfig.json mobile-staff/
cp mobile/.gitignore mobile-staff/
cp mobile/assets/* mobile-staff/assets/
cp mobile/src/api/client.ts mobile-staff/src/api/
cp mobile/src/components/ui.tsx mobile-staff/src/components/
cp mobile/src/hooks/useAuth.tsx mobile-staff/src/hooks/
cp mobile/src/theme/index.ts mobile-staff/src/theme/
cp mobile/src/screens/auth/LoginScreen.tsx mobile-staff/src/screens/auth/
cp mobile/src/screens/shared/NoticesScreen.tsx mobile-staff/src/screens/shared/
cp mobile/src/screens/shared/ProfileScreen.tsx mobile-staff/src/screens/shared/
# Staff-only screens
cp mobile/src/screens/teacher/DashboardScreen.tsx mobile-staff/src/screens/teacher/
cp mobile/src/screens/teacher/AttendanceScreen.tsx mobile-staff/src/screens/teacher/
cp mobile/src/screens/teacher/MarksScreen.tsx mobile-staff/src/screens/teacher/
cp mobile/src/screens/teacher/HomeworkScreen.tsx mobile-staff/src/screens/teacher/
cp mobile/src/screens/accountant/DashboardScreen.tsx mobile-staff/src/screens/accountant/
cp mobile/src/screens/accountant/FeeCollectionScreen.tsx mobile-staff/src/screens/accountant/

# ── Copy shared files into PARENT ────────────────────────
cp mobile/babel.config.js mobile-parent/
cp mobile/tsconfig.json mobile-parent/
cp mobile/.gitignore mobile-parent/
cp mobile/assets/* mobile-parent/assets/
cp mobile/src/api/client.ts mobile-parent/src/api/
cp mobile/src/components/ui.tsx mobile-parent/src/components/
cp mobile/src/hooks/useAuth.tsx mobile-parent/src/hooks/
cp mobile/src/theme/index.ts mobile-parent/src/theme/
cp mobile/src/screens/auth/LoginScreen.tsx mobile-parent/src/screens/auth/
cp mobile/src/screens/shared/NoticesScreen.tsx mobile-parent/src/screens/shared/
cp mobile/src/screens/shared/ProfileScreen.tsx mobile-parent/src/screens/shared/
# Parent-only screens
cp mobile/src/screens/parent/DashboardScreen.tsx mobile-parent/src/screens/parent/
cp mobile/src/screens/parent/ReportCardScreen.tsx mobile-parent/src/screens/parent/
cp mobile/src/screens/parent/FeesScreen.tsx mobile-parent/src/screens/parent/
cp mobile/src/screens/student/DashboardScreen.tsx mobile-parent/src/screens/student/
cp mobile/src/screens/student/ReportCardScreen.tsx mobile-parent/src/screens/student/
cp mobile/src/screens/student/HomeworkScreen.tsx mobile-parent/src/screens/student/

# ── Write App.tsx for both ────────────────────────────────
for app in mobile-staff mobile-parent; do
cat > $app/App.tsx << 'EOF'
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/hooks/useAuth';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
EOF

cat > $app/index.ts << 'EOF'
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
EOF
done

# ── Write Staff Navigator ─────────────────────────────────
cat > mobile-staff/src/navigation/RootNavigator.tsx << 'NAVEOF'
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui';
import { Colors, FontSize, FontWeight, Spacing } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import TeacherDashboard from '../screens/teacher/DashboardScreen';
import AttendanceScreen from '../screens/teacher/AttendanceScreen';
import MarksScreen from '../screens/teacher/MarksScreen';
import HomeworkScreen from '../screens/teacher/HomeworkScreen';
import AccountantDashboard from '../screens/accountant/DashboardScreen';
import FeeCollectionScreen from '../screens/accountant/FeeCollectionScreen';
import NoticesScreen from '../screens/shared/NoticesScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const tabBarStyle = { backgroundColor: Colors.white, borderTopColor: Colors.border, paddingBottom: 4, paddingTop: 4, height: 60 };
const makeOptions = (icons: Record<string, string>) => ({ route }: any) => ({
  tabBarStyle, tabBarActiveTintColor: Colors.primary, tabBarInactiveTintColor: Colors.textMuted,
  tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
  tabBarIcon: ({ focused }: { focused: boolean }) => <Text style={{ fontSize: focused ? 22 : 19 }}>{icons[route.name] || '•'}</Text>,
  headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: FontWeight.bold as any, fontSize: FontSize.lg },
});

function TeacherTabs() {
  return (
    <Tab.Navigator screenOptions={makeOptions({ Home: '🏠', Attendance: '✅', Marks: '📝', Homework: '📚', Profile: '👤' })}>
      <Tab.Screen name="Home" component={TeacherDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Marks" component={MarksScreen} options={{ title: 'Mark Entry' }} />
      <Tab.Screen name="Homework" component={HomeworkScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AccountantTabs() {
  return (
    <Tab.Navigator screenOptions={makeOptions({ Home: '🏠', Collect: '💰', Notices: '📢', Profile: '👤' })}>
      <Tab.Screen name="Home" component={AccountantDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Collect" component={FeeCollectionScreen} options={{ title: 'Fee Collection' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function WrongAppScreen() {
  const { logout } = useAuth();
  return (
    <View style={s.wrongApp}>
      <Text style={s.icon}>🏫</Text>
      <Text style={s.title}>Wrong App</Text>
      <Text style={s.msg}>This app is for school staff only (teachers and accountants).{'\n\n'}Parents and students should use the <Text style={s.bold}>School Parent</Text> app.</Text>
      <TouchableOpacity style={s.btn} onPress={logout}><Text style={s.btnText}>Log out</Text></TouchableOpacity>
    </View>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? <Stack.Screen name="Login" component={LoginScreen} />
          : user.role === 'TEACHER' ? <Stack.Screen name="Teacher" component={TeacherTabs} />
          : user.role === 'ACCOUNTANT' || user.role === 'ADMIN' ? <Stack.Screen name="Accountant" component={AccountantTabs} />
          : <Stack.Screen name="Wrong" component={WrongAppScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  wrongApp: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl, gap: Spacing.lg },
  icon: { fontSize: 64 }, title: { fontSize: 24, fontWeight: FontWeight.bold as any, color: Colors.text },
  msg: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
  bold: { fontWeight: FontWeight.bold as any, color: Colors.primary },
  btn: { backgroundColor: Colors.danger, paddingHorizontal: Spacing.xxxl, paddingVertical: Spacing.md, borderRadius: 8, marginTop: Spacing.md },
  btnText: { color: Colors.white, fontWeight: FontWeight.bold as any, fontSize: FontSize.md },
});
NAVEOF

# ── Write Parent Navigator ────────────────────────────────
cat > mobile-parent/src/navigation/RootNavigator.tsx << 'NAVEOF'
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui';
import { Colors, FontSize, FontWeight, Spacing } from '../theme';
import LoginScreen from '../screens/auth/LoginScreen';
import ParentDashboard from '../screens/parent/DashboardScreen';
import ParentReportScreen from '../screens/parent/ReportCardScreen';
import ParentFeesScreen from '../screens/parent/FeesScreen';
import StudentDashboard from '../screens/student/DashboardScreen';
import StudentReportScreen from '../screens/student/ReportCardScreen';
import StudentHomeworkScreen from '../screens/student/HomeworkScreen';
import NoticesScreen from '../screens/shared/NoticesScreen';
import ProfileScreen from '../screens/shared/ProfileScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const tabBarStyle = { backgroundColor: Colors.white, borderTopColor: Colors.border, paddingBottom: 4, paddingTop: 4, height: 60 };
const makeOptions = (icons: Record<string, string>) => ({ route }: any) => ({
  tabBarStyle, tabBarActiveTintColor: Colors.primary, tabBarInactiveTintColor: Colors.textMuted,
  tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
  tabBarIcon: ({ focused }: { focused: boolean }) => <Text style={{ fontSize: focused ? 22 : 19 }}>{icons[route.name] || '•'}</Text>,
  headerStyle: { backgroundColor: Colors.primary }, headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: FontWeight.bold as any, fontSize: FontSize.lg },
});

function ParentTabs() {
  return (
    <Tab.Navigator screenOptions={makeOptions({ Home: '🏠', Report: '📊', Fees: '💰', Notices: '📢', Profile: '👤' })}>
      <Tab.Screen name="Home" component={ParentDashboard} options={{ title: 'My Children' }} />
      <Tab.Screen name="Report" component={ParentReportScreen} options={{ title: 'Report Card' }} />
      <Tab.Screen name="Fees" component={ParentFeesScreen} options={{ title: 'Fee History' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function StudentTabs() {
  return (
    <Tab.Navigator screenOptions={makeOptions({ Home: '🏠', Report: '📊', Homework: '📚', Notices: '📢', Profile: '👤' })}>
      <Tab.Screen name="Home" component={StudentDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Report" component={StudentReportScreen} options={{ title: 'Report Card' }} />
      <Tab.Screen name="Homework" component={StudentHomeworkScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function WrongAppScreen() {
  const { logout } = useAuth();
  return (
    <View style={s.wrongApp}>
      <Text style={s.icon}>👨‍👩‍👧</Text>
      <Text style={s.title}>Wrong App</Text>
      <Text style={s.msg}>This app is for parents and students only.{'\n\n'}Teachers and accountants should use the <Text style={s.bold}>School Staff</Text> app.</Text>
      <TouchableOpacity style={s.btn} onPress={logout}><Text style={s.btnText}>Log out</Text></TouchableOpacity>
    </View>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? <Stack.Screen name="Login" component={LoginScreen} />
          : user.role === 'PARENT' ? <Stack.Screen name="Parent" component={ParentTabs} />
          : user.role === 'STUDENT' ? <Stack.Screen name="Student" component={StudentTabs} />
          : <Stack.Screen name="Wrong" component={WrongAppScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  wrongApp: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl, gap: Spacing.lg },
  icon: { fontSize: 64 }, title: { fontSize: 24, fontWeight: FontWeight.bold as any, color: Colors.text },
  msg: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 },
  bold: { fontWeight: FontWeight.bold as any, color: Colors.primary },
  btn: { backgroundColor: Colors.danger, paddingHorizontal: Spacing.xxxl, paddingVertical: Spacing.md, borderRadius: 8, marginTop: Spacing.md },
  btnText: { color: Colors.white, fontWeight: FontWeight.bold as any, fontSize: FontSize.md },
});
NAVEOF

# ── Write package.json for STAFF ─────────────────────────
cat > mobile-staff/package.json << 'EOF'
{
  "name": "school-staff",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "build:android": "eas build --profile preview --platform android",
    "build:ios": "eas build --profile preview --platform ios"
  },
  "dependencies": {
    "@expo/vector-icons": "^15.1.1",
    "@react-native-async-storage/async-storage": "~2.1.2",
    "@react-navigation/bottom-tabs": "^7.15.9",
    "@react-navigation/native": "^7.2.2",
    "@react-navigation/stack": "^7.8.9",
    "axios": "^1.14.0",
    "babel-preset-expo": "~54.0.10",
    "expo": "~54.0.33",
    "expo-constants": "~17.0.9",
    "expo-font": "~13.3.2",
    "expo-status-bar": "~3.0.9",
    "react": "19.0.0",
    "react-native": "0.77.1",
    "react-native-gesture-handler": "~2.22.0",
    "react-native-reanimated": "~3.16.7",
    "react-native-safe-area-context": "4.14.0",
    "react-native-screens": "~4.5.0"
  },
  "devDependencies": {
    "@types/react": "~19.0.10",
    "typescript": "~5.8.3"
  },
  "private": true
}
EOF

# ── Write package.json for PARENT ────────────────────────
cat > mobile-parent/package.json << 'EOF'
{
  "name": "school-parent",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "build:android": "eas build --profile preview --platform android",
    "build:ios": "eas build --profile preview --platform ios"
  },
  "dependencies": {
    "@expo/vector-icons": "^15.1.1",
    "@react-native-async-storage/async-storage": "~2.1.2",
    "@react-navigation/bottom-tabs": "^7.15.9",
    "@react-navigation/native": "^7.2.2",
    "@react-navigation/stack": "^7.8.9",
    "axios": "^1.14.0",
    "babel-preset-expo": "~54.0.10",
    "expo": "~54.0.33",
    "expo-constants": "~17.0.9",
    "expo-font": "~13.3.2",
    "expo-status-bar": "~3.0.9",
    "react": "19.0.0",
    "react-native": "0.77.1",
    "react-native-gesture-handler": "~2.22.0",
    "react-native-reanimated": "~3.16.7",
    "react-native-safe-area-context": "4.14.0",
    "react-native-screens": "~4.5.0"
  },
  "devDependencies": {
    "@types/react": "~19.0.10",
    "typescript": "~5.8.3"
  },
  "private": true
}
EOF

# ── Write app.config.js for STAFF ────────────────────────
cat > mobile-staff/app.config.js << 'EOF'
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
EOF

# ── Write app.config.js for PARENT ───────────────────────
cat > mobile-parent/app.config.js << 'EOF'
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
  extra: { apiUrl: process.env.API_URL || 'http://192.168.1.65:4000/api', eas: { projectId: '' } },
});
EOF

# ── Write eas.json for both ───────────────────────────────
for app in mobile-staff mobile-parent; do
cat > $app/eas.json << 'EOF'
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "API_URL": "http://192.168.1.65:4000/api" }
    },
    "production": {
      "distribution": "store",
      "env": { "API_URL": "https://api.yourschool.com/api" }
    }
  }
}
EOF
done

# ── Write .env.example for both ──────────────────────────
for app in mobile-staff mobile-parent; do
cat > $app/.env.example << 'EOF'
# Copy to .env and set your machine's LAN IP
# Find it: ifconfig | grep "inet " | grep -v 127.0.0.1
API_URL=http://192.168.1.65:4000/api
EOF
done

echo ""
echo "Done! Now run:"
echo "  git add mobile-staff/ mobile-parent/"
echo "  git commit -m 'Add mobile-staff and mobile-parent apps'"
echo "  git push"