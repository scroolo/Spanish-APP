import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme';
import { useRecording, type RecordingResult } from '@/src/hooks/useRecording';

interface Props {
  onResult: (result: RecordingResult) => void;
  onError?: (message: string) => void;
  label?: string;
  recordingLabel?: string;
}

export function RecordButton({ onResult, onError, label = 'Nahrať', recordingLabel = 'Nahrávam…' }: Props) {
  const { colors, radius, spacing } = useTheme();
  const { start, stop, recording, recordingSeconds } = useRecording();

  const handlePress = async () => {
    if (!recording) {
      const ok = await start();
      if (!ok) onError?.('Microfón nie je povolený.');
      return;
    }
    const result = await stop();
    if (result) onResult(result);
    else onError?.('Nepodarilo sa nahrať audio.');
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: recording ? colors.danger : colors.primary,
            borderRadius: radius.lg,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons name={recording ? 'stop' : 'mic'} size={22} color="#FFFFFF" />
        <Text style={styles.label}>{recording ? `${recordingLabel} ${recordingSeconds}s` : label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 0 },
  button: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
