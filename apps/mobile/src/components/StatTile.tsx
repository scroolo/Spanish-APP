import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  icon: string;
  value: string;
  label: string;
}

export function StatTile({ icon, value, label }: Props) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20 },
  value: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  label: { fontSize: 12, textAlign: 'center' },
});
