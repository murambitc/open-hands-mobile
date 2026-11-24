export interface MoodDef {
  emoji: string;
  label: string;
  category: 'positive' | 'sad' | 'stressed' | 'angry' | 'calm';
  score: number;
}

export const MOODS: MoodDef[] = [
  { emoji: '😊', label: 'Happy',       category: 'positive', score: 3 },
  { emoji: '😄', label: 'Excited',     category: 'positive', score: 3 },
  { emoji: '🙂', label: 'Content',     category: 'positive', score: 2 },
  { emoji: '😌', label: 'Relaxed',     category: 'calm',     score: 2 },
  { emoji: '😍', label: 'Loved',       category: 'positive', score: 3 },
  { emoji: '😎', label: 'Confident',   category: 'positive', score: 2 },
  { emoji: '🤔', label: 'Thoughtful',  category: 'calm',     score: 0 },
  { emoji: '😐', label: 'Neutral',     category: 'calm',     score: 0 },
  { emoji: '😕', label: 'Confused',    category: 'sad',      score: -1 },
  { emoji: '😟', label: 'Worried',     category: 'stressed', score: -2 },
  { emoji: '😢', label: 'Sad',         category: 'sad',      score: -2 },
  { emoji: '😡', label: 'Angry',       category: 'angry',    score: -2 },
  { emoji: '😩', label: 'Stressed',    category: 'stressed', score: -2 },
  { emoji: '😴', label: 'Tired',       category: 'sad',      score: -1 },
  { emoji: '😰', label: 'Anxious',     category: 'stressed', score: -2 },
  { emoji: '🥺', label: 'Overwhelmed', category: 'stressed', score: -2 },
];

export const MOOD_COLORS: Record<string, string> = {
  positive: '#22c55e',
  sad: '#3b82f6',
  stressed: '#ef4444',
  angry: '#f97316',
  calm: '#06b6d4',
};

export function moodEmoji(mood: string): string {
  const m = mood.toLowerCase();
  for (const def of MOODS) {
    if (m.includes(def.label.toLowerCase())) return def.emoji;
  }
  return '😐';
}

export function moodCategory(mood: string): string {
  const m = mood.toLowerCase();
  for (const def of MOODS) {
    if (m.includes(def.label.toLowerCase())) return def.category;
  }
  return 'calm';
}