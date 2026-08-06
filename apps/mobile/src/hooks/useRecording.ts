import { useRef, useState } from 'react';
import { requestRecordingPermissionsAsync, useAudioRecorder, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system';

export interface RecordingResult {
  base64: string;
  mimeType: string;
  seconds: number;
}

export function useRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const startTime = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    const granted = await requestRecordingPermissionsAsync();
    if (!granted.granted) return false;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
    startTime.current = Date.now();
    setRecordingSeconds(0);
    timer.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return true;
  };

  const stop = async (): Promise<RecordingResult | null> => {
    if (!recording) return null;
    await recorder.stop();
    const uri = recorder.uri;
    if (timer.current) clearInterval(timer.current);
    const seconds = Math.max(1, Math.round((Date.now() - (startTime.current ?? Date.now())) / 1000));
    setRecording(false);
    if (!uri) return null;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return { base64, mimeType: 'audio/m4a', seconds };
  };

  const cancel = () => {
    if (recording) void recorder.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  };

  return { start, stop, cancel, recording, recordingSeconds };
}
