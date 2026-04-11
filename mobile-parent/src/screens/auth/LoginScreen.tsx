import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, TouchableOpacity,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { Input, Button } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';
import { getErrorMessage } from '../../api/client';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Login failed', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>श्री</Text>
          </View>
          <Text style={styles.appName}>Zentara शिक्षा</Text>
          <Text style={styles.appSub}>A complete digital solution for modern schools</Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="admin@school.edu.np"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.passwordWrapper}>
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              secureTextEntry={!showPassword}
              style={{ marginBottom: 0 }}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            style={styles.loginBtn}
          />
        </View>

        <Text style={styles.footer}>A product of Zentara Labs Pvt Ltd</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surfaceAlt },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },

  logoArea: { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoBox: {
    width: 72, height: 72, borderRadius: 18,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoText: { fontSize: 28, color: Colors.white, fontWeight: FontWeight.bold },
  appName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  appSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },

  formCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: Spacing.xl, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08,
    shadowRadius: 8, elevation: 4,
  },

  passwordWrapper: { position: 'relative', marginBottom: Spacing.md },
  eyeBtn: { position: 'absolute', right: Spacing.md, bottom: Spacing.md },

  loginBtn: { marginTop: Spacing.sm },
  footer: { textAlign: 'center', color: Colors.textLight, fontSize: FontSize.xs, marginTop: Spacing.xxl },
});
