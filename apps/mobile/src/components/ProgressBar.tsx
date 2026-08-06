import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  percent: number;
  label?: string;
  color?: string;
}

export function ProgressBar({ percent, label, color }: Props) {
  const { colors, radius } = useTheme();
  const barColor = color ?? (percent >= 70 ? colors.teal : percent >= 40 ? colors.warning : colors.danger);
  return (
    <View style={styles.row}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.pct, { color: colors.textMuted }]}>{percent}%</Text>
        </View>
      ) : null}
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radius.full }]}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: barColor, borderRadius: radius.full },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '600' },
  pct: { fontSize: 13, fontWeight: '600' },
  track: { height: 10, overflow: 'hidden' },
  fill: { height: 10 },
});
