import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import Toast from 'react-native-toast-message';
import { Colors, Radius } from '@/constants/theme';
import { parseVoiceCommand, VoiceAction } from '@/services/voiceCommands';

interface VoiceCommandButtonProps {
  onAction: (action: VoiceAction) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  lang?: string;
  compact?: boolean;
}

export function VoiceCommandButton({
  onAction,
  onTranscript,
  lang = 'en-US',
  compact = false,
}: VoiceCommandButtonProps) {
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState('');

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setLiveText('');
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
  });

  useSpeechRecognitionEvent('result', (event: any) => {
    const transcript = String(event?.results?.[0]?.transcript ?? '').trim();
    const isFinal = Boolean(event?.isFinal);
    if (transcript) {
      setLiveText(transcript);
      onTranscript?.(transcript, isFinal);
    }
    if (isFinal && transcript) {
      const action = parseVoiceCommand(transcript);
      onAction(action);
    }
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    setListening(false);
    const code = event?.error || event?.code || 'unknown';
    if (code !== 'no-speech' && code !== 'aborted') {
      Toast.show({
        type: 'error',
        text1: 'Microphone error',
        text2: String(event?.message || code),
      });
    }
  });

  async function toggleListening() {
    if (listening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
      setListening(false);
      return;
    }

    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    if (!available) {
      Toast.show({
        type: 'error',
        text1: 'Speech recognition unavailable',
        text2: 'Check device speech services.',
      });
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Toast.show({
        type: 'error',
        text1: 'Microphone permission required',
        text2: 'Enable microphone & speech permissions in settings.',
      });
      return;
    }

    setLiveText('');
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: false,
    });
  }

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[
          compact ? styles.compactBtn : styles.fullBtn,
          listening && styles.listeningBtn,
        ]}
        onPress={toggleListening}
        activeOpacity={0.8}
        accessibilityLabel={listening ? 'Stop voice command' : 'Start voice command'}
      >
        {listening ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="mic" size={compact ? 18 : 16} color="#fff" />
        )}
        {!compact && (
          <Text style={styles.btnText}>
            {listening ? 'Listening...' : 'Voice Command'}
          </Text>
        )}
      </TouchableOpacity>

      {listening && liveText.length > 0 && (
        <Text style={styles.liveTranscript} numberOfLines={2}>
          “{liveText}”
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
  },
  compactBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  listeningBtn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accentLight,
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  liveTranscript: {
    marginTop: 4,
    color: Colors.accentLight,
    fontSize: 11,
    fontStyle: 'italic',
    maxWidth: 220,
  },
});