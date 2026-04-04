import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { api, getErrorMessage } from '../../api/client';
import { Card, Button } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

const ROLE_LABELS: Record<string, string> = {
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
  ACCOUNTANT: 'Accountant',
  ADMIN: 'Administrator',
};

const ROLE_COLORS: Record<string, string> = {
  TEACHER: Colors.info,
  STUDENT: Colors.success,
  PARENT: Colors.warning,
  ACCOUNTANT: Colors.accent,
  ADMIN: Colors.primary,
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const roleLabel = ROLE_LABELS[user?.role || ''] || user?.role || '';
  const roleColor = ROLE_COLORS[user?.role || ''] || Colors.primary;
  const displayName = user?.teacher?.name || user?.student?.name || user?.email || '';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
            } catch (err) {
              console.error('Logout error:', err);
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Error', 'Enter your current password'); return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters'); return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match'); return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      Alert.alert('Success', 'Password changed successfully', [
        {
          text: 'OK',
          onPress: () => {
            setShowChangePassword(false);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowChangePassword(false);
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Avatar + name */}
      <View style={s.header}>
        <View style={[s.avatar, { backgroundColor: roleColor }]}>
          <Text style={s.avatarText}>{initials || '?'}</Text>
        </View>
        <Text style={s.name}>{displayName || 'User'}</Text>
        <Text style={s.email}>{user?.email}</Text>
        <View style={[s.roleBadge, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
          <Text style={[s.roleText, { color: roleColor }]}>{roleLabel}</Text>
        </View>
      </View>

      {/* Account section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Account</Text>

        <Card style={s.menuCard}>
          <TouchableOpacity style={s.menuItem} onPress={() => setShowChangePassword(true)}>
            <Text style={s.menuIcon}>🔑</Text>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Change Password</Text>
              <Text style={s.menuSub}>Update your login password</Text>
            </View>
            <Text style={s.menuArrow}>›</Text>
          </TouchableOpacity>

          <View style={s.menuDivider} />

          <View style={s.menuItem}>
            <Text style={s.menuIcon}>📧</Text>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Email</Text>
              <Text style={s.menuSub}>{user?.email}</Text>
            </View>
          </View>

          <View style={s.menuDivider} />

          <View style={s.menuItem}>
            <Text style={s.menuIcon}>🎭</Text>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Role</Text>
              <Text style={s.menuSub}>{roleLabel}</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* App info section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>App</Text>
        <Card style={s.menuCard}>
          <View style={s.menuItem}>
            <Text style={s.menuIcon}>🏫</Text>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Shree Himalayan Secondary School</Text>
              <Text style={s.menuSub}>School Management System</Text>
            </View>
          </View>
          <View style={s.menuDivider} />
          <View style={s.menuItem}>
            <Text style={s.menuIcon}>📱</Text>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Version</Text>
              <Text style={s.menuSub}>1.0.0</Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Logout */}
      <View style={s.section}>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={s.logoutText}>Log out</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Change Password</Text>
            <TouchableOpacity onPress={closeModal}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Current Password</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.textInput, { flex: 1 }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowCurrent(v => !v)}>
                <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>New Password</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.textInput, { flex: 1 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor={Colors.textLight}
                secureTextEntry={!showNew}
                autoCapitalize="none"
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowNew(v => !v)}>
                <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Confirm New Password</Text>
            <TextInput
              style={s.textInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter new password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry={true}
              autoCapitalize="none"
            />

            {newPassword.length > 0 && newPassword !== confirmPassword && (
              <Text style={s.errorText}>Passwords do not match</Text>
            )}

            <View style={{ height: Spacing.xxxl }} />
          </ScrollView>

          <View style={s.modalFooter}>
            <Button title="Cancel" variant="outline" onPress={closeModal} style={{ flex: 1 }} />
            <Button
              title="Update Password"
              onPress={handleChangePassword}
              loading={saving}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { backgroundColor: Colors.primary, alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { fontSize: 28, fontWeight: FontWeight.bold as any, color: Colors.white },
  name: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.white },
  email: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)' },
  roleBadge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1, marginTop: Spacing.xs },
  roleText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any },
  section: { padding: Spacing.lg, gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  menuCard: { padding: 0, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, gap: Spacing.md },
  menuIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  menuText: { flex: 1, gap: 2 },
  menuLabel: { fontSize: FontSize.md, fontWeight: FontWeight.medium as any, color: Colors.text },
  menuSub: { fontSize: FontSize.sm, color: Colors.textMuted },
  menuArrow: { fontSize: FontSize.xl, color: Colors.textLight },
  menuDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 64 },
  logoutBtn: { backgroundColor: Colors.danger, borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center' },
  logoutText: { color: Colors.white, fontSize: FontSize.md, fontWeight: FontWeight.bold as any },
  modal: { flex: 1, backgroundColor: Colors.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold as any, color: Colors.text },
  modalClose: { fontSize: FontSize.xl, color: Colors.textMuted, padding: Spacing.sm },
  modalBody: { flex: 1, padding: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold as any, color: Colors.text, marginBottom: Spacing.xs, marginTop: Spacing.md },
  textInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eyeBtn: { padding: Spacing.md },
  eyeIcon: { width: 24, alignItems: 'center' as any, justifyContent: 'center' as any },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.xs },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
});