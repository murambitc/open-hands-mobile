import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MOODS, MOOD_COLORS } from '@/constants/moods';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface Props {
  selected: string | null;
  onSelect: (mood: string) => void;
}

export function MoodSelector({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {MOODS.map((m) => {
        const value = `${m.emoji} ${m.label}`;
        const isActive = selected === value;
        return (
          <TouchableOpacity
            key={m.label}
            onPress={() => onSelect(value)}
            style={[styles.tile, isActive && styles.tileActive]}
            activeOpacity={0.75}
          >
            <Text style={styles.emoji}>{m.emoji}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '23%',
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  tileActive: {
    backgroundColor: 'rgba(255,77,141,0.2)',
    borderColor: Colors.accentLight,
  },
  emoji: { fontSize: 22, marginBottom: 4 },
  label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  labelActive: { color: '#fff', fontWeight: '600' },
});