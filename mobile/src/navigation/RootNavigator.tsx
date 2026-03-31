import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui';
import { Colors, FontSize, FontWeight } from '../theme';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Teacher
import TeacherDashboard from '../screens/teacher/DashboardScreen';
import AttendanceScreen from '../screens/teacher/AttendanceScreen';
import MarksScreen from '../screens/teacher/MarksScreen';
import NoticesScreen from '../screens/shared/NoticesScreen';

// Parent
import ParentDashboard from '../screens/parent/DashboardScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const tabBarStyle = {
  backgroundColor: Colors.white,
  borderTopColor: Colors.border,
  paddingBottom: 4,
  paddingTop: 4,
  height: 58,
};

const screenOptions = {
  headerStyle: { backgroundColor: Colors.primary },
  headerTintColor: Colors.white,
  headerTitleStyle: { fontWeight: FontWeight.bold as any, fontSize: FontSize.lg },
  headerBackTitleVisible: false,
};

// ─── Teacher Tabs ─────────────────────────────────────────
function TeacherTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
        tabBarIcon: ({ color, focused }) => {
          const icons: Record<string, string> = {
            Home: '🏠', Attendance: '✅', Marks: '📝',
            Homework: '📚', Notices: '📢',
          };
          return <Text style={{ fontSize: focused ? 22 : 20 }}>{icons[route.name] || '•'}</Text>;
        },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: FontWeight.bold as any },
      })}
    >
      <Tab.Screen name="Home" component={TeacherDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Marks" component={MarksScreen} options={{ title: 'Mark Entry' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

// ─── Parent Tabs ──────────────────────────────────────────
function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
        tabBarIcon: ({ focused }) => {
          const icons: Record<string, string> = {
            Home: '🏠', ParentReport: '📊', ParentFees: '💰', ParentNotices: '📢',
          };
          return <Text style={{ fontSize: focused ? 22 : 20 }}>{icons[route.name] || '•'}</Text>;
        },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: FontWeight.bold as any },
      })}
    >
      <Tab.Screen name="Home" component={ParentDashboard} options={{ title: 'My Children' }} />
      <Tab.Screen name="ParentNotices" component={NoticesScreen} options={{ title: 'Notices' }} />
    </Tab.Navigator>
  );
}

// ─── Student Tabs ─────────────────────────────────────────
function StudentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
        tabBarIcon: ({ focused }) => {
          const icons: Record<string, string> = { Home: '🏠', Notices: '📢' };
          return <Text style={{ fontSize: focused ? 22 : 20 }}>{icons[route.name] || '•'}</Text>;
        },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: FontWeight.bold as any },
      })}
    >
      <Tab.Screen name="Home" component={ParentDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────
export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.role === 'TEACHER' ? (
          <Stack.Screen name="TeacherApp" component={TeacherTabs} />
        ) : user.role === 'PARENT' ? (
          <Stack.Screen name="ParentApp" component={ParentTabs} />
        ) : user.role === 'STUDENT' ? (
          <Stack.Screen name="StudentApp" component={StudentTabs} />
        ) : (
          // Admin/Accountant — show basic screen for now
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
