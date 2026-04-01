import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { api } from '../../api/client';
import { Card, Badge, EmptyState, LoadingScreen } from '../../components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme';

interface HomeworkItem {
  id: string;
  title: string;
  description: string;
  dueDateBS: string;
  subject: { name: string };
  section: { name: string; grade: { name: string } };
}

export default function StudentHomeworkScreen() {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get<HomeworkItem[]>('/homework');
      setHomework(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Homework load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingScreen />;

  const today = new Date();
  const isOverdue = (dueDateBS: string) => {
    // Simple check — if BS date string looks past, mark overdue
    return false; // Conservative — don't falsely mark overdue
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Homework</Text>
        <Text style={s.headerCount}>{homework.length} assignment{homework.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={homework}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        ListEmptyComponent={<EmptyState icon="✅" message="No homework assigned — enjoy!" />}
        renderItem={({ item }) => (
          <Card style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Badge label={`Due ${item.dueDateBS}`} color="warning" />
            </View>
            <View style={s.badges}>
              <Badge label={item.subject?.name} color="info" />
              <Badge label={`${item.section?.grade?.name}-${item.section?.name}`} color="primary" />
            </View>
            {item.description ? (
              <View style={s.descBox}>
                <Text style={s.descText}>{item.description}</Text>
              </View>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold as any, color: Colors.text },
  headerCount: { fontSize: FontSize.sm, color: Colors.textMuted },
  card: { gap: Spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold as any, color: Colors.text },
  badges: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  descBox: { backgroundColor: Colors.surfaceAlt, borderRadius: Radius.sm, padding: Spacing.md },
  descText: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
});
