import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, ViewStyle, TextStyle,
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '../theme';

// ─── Card ────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── StatCard ────────────────────────────────────────────
export function StatCard({ label, value, color = Colors.primary, icon }: {
  label: string; value: string | number; color?: string; icon?: React.ReactNode;
}) {
  return (
    <Card style={styles.statCard}>
      {icon && <View style={styles.statIcon}>{icon}</View>}
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

// ─── Button ──────────────────────────────────────────────
export function Button({ title, onPress, loading, variant = 'primary', disabled, style }: {
  title: string; onPress: () => void; loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'; disabled?: boolean; style?: ViewStyle;
}) {
  const btnStyle = [
    styles.btn,
    variant === 'primary' && styles.btnPrimary,
    variant === 'outline' && styles.btnOutline,
    variant === 'ghost' && styles.btnGhost,
    variant === 'danger' && styles.btnDanger,
    (disabled || loading) && styles.btnDisabled,
    style,
  ];
  const textStyle = [
    styles.btnText,
    variant === 'outline' && styles.btnTextOutline,
    variant === 'ghost' && styles.btnTextGhost,
    variant === 'danger' && styles.btnTextDanger,
  ];

  return (
    <TouchableOpacity style={btnStyle} onPress={onPress} disabled={disabled || loading} activeOpacity={0.8}>
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? Colors.white : Colors.primary} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Input ───────────────────────────────────────────────
export function Input({ label, error, style, ...props }: {
  label?: string; error?: string; style?: ViewStyle;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.inputWrapper, style]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={Colors.textLight}
        {...props}
      />
      {error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
}

// ─── Badge ───────────────────────────────────────────────
export function Badge({ label, color = 'default' }: {
  label: string;
  color?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'primary';
}) {
  const badgeColors = {
    default: { bg: Colors.borderLight, text: Colors.textMuted },
    success: { bg: Colors.successBg, text: Colors.success },
    danger: { bg: Colors.dangerBg, text: Colors.danger },
    warning: { bg: Colors.warningBg, text: Colors.warning },
    info: { bg: Colors.infoBg, text: Colors.info },
    primary: { bg: '#e8eef5', text: Colors.primary },
  }[color];

  return (
    <View style={[styles.badge, { backgroundColor: badgeColors.bg }]}>
      <Text style={[styles.badgeText, { color: badgeColors.text }]}>{label}</Text>
    </View>
  );
}

// ─── SectionHeader ───────────────────────────────────────
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────
export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <View style={styles.empty}>
      {icon && <Text style={styles.emptyIcon}>{icon}</Text>}
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ─── LoadingScreen ───────────────────────────────────────
export function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

// ─── ScreenHeader ────────────────────────────────────────
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle && <Text style={styles.screenSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ─── Row ─────────────────────────────────────────────────
export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

// ─── Divider ─────────────────────────────────────────────
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  statCard: {
    alignItems: 'center',
    padding: Spacing.md,
    flex: 1,
  },
  statIcon: { marginBottom: Spacing.xs },
  statValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, marginBottom: 2 },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  btn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary },
  btnGhost: { backgroundColor: Colors.borderLight },
  btnDanger: { backgroundColor: Colors.danger },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.white },
  btnTextOutline: { color: Colors.primary },
  btnTextGhost: { color: Colors.text },
  btnTextDanger: { color: Colors.white },

  inputWrapper: { marginBottom: Spacing.md },
  inputLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.text, marginBottom: Spacing.xs },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.white,
  },
  inputError: { borderColor: Colors.danger },
  inputErrorText: { fontSize: FontSize.xs, color: Colors.danger, marginTop: 4 },

  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  sectionHeader: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  sectionSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 3 },

  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },

  screenHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  screenTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.primary },
  screenSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 3 },

  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.sm },
});
