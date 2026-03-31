import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface Notice {
  id: string; title: string; content: string; type: string;
  priority: string; publishDate: string; isPinned: boolean;
  grade?: { name: string };
}

const typeColor: Record<string, any> = {
  GENERAL: 'info', EXAM: 'primary', EVENT: 'success',
  HOLIDAY: 'warning', FEE: 'danger',
};

export default function NoticesScreen() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetch = async () => {
    try {
      const data = await api.get<Notice[]>('/notices');
      setNotices(data);
    } catch (err) { console.error(err); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  if (loading) return <LoadingScreen />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={notices}
      keyExtractor={n => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} />}
      ListEmptyComponent={<EmptyState message="No notices at this time." icon="📢" />}
      renderItem={({ item: n }) => (
        <TouchableOpacity onPress={() => setExpanded(expanded === n.id ? null : n.id)} activeOpacity={0.9}>
          <View style={[styles.card, n.priority === 'URGENT' && styles.cardUrgent, n.priority === 'IMPORTANT' && styles.cardImportant]}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                {n.isPinned && <Text style={styles.pinIcon}>📌</Text>}
                <Text style={styles.title} numberOfLines={expanded === n.id ? undefined : 1}>{n.title}</Text>
              </View>
              <Badge label={n.type} color={typeColor[n.type] || 'default'} />
            </View>
            {n.priority === 'URGENT' && (
              <View style={styles.urgentBadge}><Text style={styles.urgentText}>URGENT</Text></View>
            )}
            <Text style={[styles.content2, expanded !== n.id && styles.contentCollapsed]}>
              {n.content}
            </Text>
            <View style={styles.footer}>
              <Text style={styles.date}>{n.publishDate}</Text>
              {n.grade && <Text style={styles.grade}>{n.grade.name}</Text>}
              <Text style={styles.expand}>{expanded === n.id ? 'Show less ↑' : 'Read more ↓'}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  cardUrgent: { borderLeftWidth: 4, borderLeftColor: Colors.danger },
  cardImportant: { borderLeftWidth: 4, borderLeftColor: Colors.warning },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.xs, marginRight: Spacing.sm },
  pinIcon: { fontSize: 13 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.primary, flex: 1 },
  urgentBadge: { backgroundColor: Colors.dangerBg, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  urgentText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.danger },
  content2: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  contentCollapsed: { numberOfLines: 2 } as any,
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.md },
  date: { fontSize: FontSize.xs, color: Colors.textMuted },
  grade: { fontSize: FontSize.xs, color: Colors.textMuted },
  expand: { fontSize: FontSize.xs, color: Colors.primary, marginLeft: 'auto' },
});
