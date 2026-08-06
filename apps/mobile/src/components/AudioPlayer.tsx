import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/src/theme';

interface Props {
  url: string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AudioPlayer({ url, label, size = 'md' }: Props) {
  const { colors, radius, spacing } = useTheme();
  const player = useAudioPlayer(useMemo(() => ({ uri: url }), [url]));
  const status = useAudioPlayerStatus(player);

  const dims = size === 'lg' ? 64 : size === 'sm' ? 40 : 52;
  const iconSize = size === 'lg' ? 30 : size === 'sm' ? 20 : 24;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          if (status.playing) player.pause();
          else player.play();
        }}
        style={({ pressed }) => [
          styles.button,
          {
            width: dims,
            height: dims,
            borderRadius: radius.full,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityLabel={label}
      >
        {status.isBuffering || !status.isLoaded ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={iconSize}
            color="#FFFFFF"
            style={status.playing ? undefined : styles.playOffset}
          />
        )}
      </Pressable>
      {label ? (
        <Text style={[styles.label, { color: colors.textMuted, marginLeft: spacing.sm }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: { alignItems: 'center', justifyContent: 'center' },
  playOffset: { marginLeft: 2 },
  label: { fontSize: 14, flex: 1 },
});
