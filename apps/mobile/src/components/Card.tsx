import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useTheme } from '../theme';

export function Card({ style, children, ...props }: ViewProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.lg,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.title, { color: colors.text }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
});
