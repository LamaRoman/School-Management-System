import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { LoadingScreen } from '../components/ui';
import { Colors, FontSize, FontWeight } from '../theme';

import LoginScreen from '../screens/auth/LoginScreen';
import TeacherDashboard from '../screens/teacher/DashboardScreen';
import AttendanceScreen from '../screens/teacher/AttendanceScreen';
import MarksScreen from '../screens/teacher/MarksScreen';
import HomeworkScreen from '../screens/teacher/HomeworkScreen';
import ParentDashboard from '../screens/parent/DashboardScreen';
import ParentReportScreen from '../screens/parent/ReportCardScreen';
import ParentFeesScreen from '../screens/parent/FeesScreen';
import StudentDashboard from '../screens/student/DashboardScreen';
import StudentReportScreen from '../screens/student/ReportCardScreen';
import StudentHomeworkScreen from '../screens/student/HomeworkScreen';
import AccountantDashboard from '../screens/accountant/DashboardScreen';
import FeeCollectionScreen from '../screens/accountant/FeeCollectionScreen';
import NoticesScreen from '../screens/shared/NoticesScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const tabBarStyle = {
  backgroundColor: Colors.white,
  borderTopColor: Colors.border,
  paddingBottom: 4,
  paddingTop: 4,
  height: 58,
};

const tabIcon = (icons: Record<string, string>) =>
  ({ route }: any) => ({
    tabBarStyle,
    tabBarActiveTintColor: Colors.primary,
    tabBarInactiveTintColor: Colors.textMuted,
    tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.medium as any },
    tabBarIcon: ({ focused }: { focused: boolean }) => (
      <Text style={{ fontSize: focused ? 22 : 20 }}>{icons[route.name] || '•'}</Text>
    ),
    headerStyle: { backgroundColor: Colors.primary },
    headerTintColor: Colors.white,
    headerTitleStyle: { fontWeight: FontWeight.bold as any },
  });

function TeacherTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Home: '🏠', Attendance: '✅', Marks: '📝', Homework: '📚', Notices: '📢' })}>
      <Tab.Screen name="Home" component={TeacherDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Marks" component={MarksScreen} options={{ title: 'Mark Entry' }} />
      <Tab.Screen name="Homework" component={HomeworkScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

function ParentTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Home: '🏠', Report: '📊', Fees: '💰', Notices: '📢' })}>
      <Tab.Screen name="Home" component={ParentDashboard} options={{ title: 'My Children' }} />
      <Tab.Screen name="Report" component={ParentReportScreen} options={{ title: 'Report Card' }} />
      <Tab.Screen name="Fees" component={ParentFeesScreen} options={{ title: 'Fee History' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

function StudentTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Home: '🏠', Report: '📊', Homework: '📚', Notices: '📢' })}>
      <Tab.Screen name="Home" component={StudentDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Report" component={StudentReportScreen} options={{ title: 'Report Card' }} />
      <Tab.Screen name="Homework" component={StudentHomeworkScreen} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

function AccountantTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Home: '🏠', Collect: '💰', Notices: '📢' })}>
      <Tab.Screen name="Home" component={AccountantDashboard} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Collect" component={FeeCollectionScreen} options={{ title: 'Fee Collection' }} />
      <Tab.Screen name="Notices" component={NoticesScreen} />
    </Tab.Navigator>
  );
}

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
        ) : user.role === 'ACCOUNTANT' ? (
          <Stack.Screen name="AccountantApp" component={AccountantTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
