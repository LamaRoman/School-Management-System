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
