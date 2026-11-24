export type VoiceAction =
  | { type: 'navigate'; route: '/(tabs)/dashboard' | '/(tabs)/screening' | '/(tabs)/mood-logs' | '/(tabs)/tracker' | '/(tabs)/organizations' | '/(tabs)/wellness-tools' | '/(tabs)/sessions' | '/chat' }
  | { type: 'mood'; mood: string; comment?: string }
  | { type: 'chat'; prompt: string }
  | { type: 'unknown'; transcript: string };

export function parseVoiceCommand(rawTranscript: string): VoiceAction {
  const transcript = (rawTranscript || '').trim();
  const normalized = transcript.toLowerCase();

  if (!normalized) {
    return { type: 'unknown', transcript: '' };
  }

  // Navigation commands
  if (normalized.includes('open chat') || normalized.includes('talk to ai') || normalized.includes('start chat')) {
    return { type: 'navigate', route: '/chat' };
  }
  if (normalized.includes('open session') || normalized.includes('show session') || normalized.includes('upcoming session')) {
    return { type: 'navigate', route: '/(tabs)/sessions' };
  }
  if (normalized.includes('wellness tool') || normalized.includes('meditat') || normalized.includes('breath') || normalized.includes('journal') || normalized.includes('habit')) {
    return { type: 'navigate', route: '/(tabs)/wellness-tools' };
  }
  if (normalized.includes('screening') || normalized.includes('assessment')) {
    return { type: 'navigate', route: '/(tabs)/screening' };
  }
  if (normalized.includes('mood log') || normalized.includes('check-in log') || normalized.includes('my logs')) {
    return { type: 'navigate', route: '/(tabs)/mood-logs' };
  }
  if (normalized.includes('tracker') || normalized.includes('trend') || normalized.includes('chart')) {
    return { type: 'navigate', route: '/(tabs)/tracker' };
  }
  if (normalized.includes('director') || normalized.includes('organization') || normalized.includes('support group')) {
    return { type: 'navigate', route: '/(tabs)/organizations' };
  }
  if (normalized.includes('dashboard') || normalized.includes('go home') || normalized.includes('home screen')) {
    return { type: 'navigate', route: '/(tabs)/dashboard' };
  }

  // Quick mood check-in commands ("I feel calm", "feeling anxious", etc.)
  const moodKeywords: Record<string, string> = {
    calm: '😌 Calm',
    happy: '😊 Happy',
    grateful: '🙏 Grateful',
    okay: '🙂 Okay',
    stressed: '😰 Stressed',
    anxious: '😟 Anxious',
    sad: '😔 Sad',
    angry: '😠 Angry',
    tired: '😴 Tired',
  };

  if (normalized.includes('i feel') || normalized.includes('feeling') || normalized.includes('check in')) {
    for (const [word, label] of Object.entries(moodKeywords)) {
      if (normalized.includes(word)) {
        return { type: 'mood', mood: label, comment: transcript };
      }
    }
  }

  // Default: send spoken phrase as an AI chat prompt
  return { type: 'chat', prompt: transcript };
}