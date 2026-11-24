import React from 'react';
import { TouchableOpacity, Alert, StyleSheet, ViewStyle, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/store/authStore';
import { Colors, Radius } from '@/constants/theme';

interface Props {
  /** Show the icon button only (default: true) */
  iconOnly?: boolean;
  /** Icon name (default: 'log-out') */
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Icon size (default: 18) */
  iconSize?: number;
  /** Custom style on the touchable wrapper */
  style?: ViewStyle;
  /** Optional text label (shown when iconOnly is false) */
  label?: string;
}

export function LogoutButton({
  iconOnly = true,
  iconName = 'log-out',
  iconSize = 18,
  style,
  label,
}: Props) {
  const router = useRouter();
  const { logout } = useAuth();

  function confirmLogout() {
    Alert.alert(
      'Log out?',
      'You will need to sign in again to access your account. Your offline entries stay saved on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } finally {
              // Always navigate to login, even if the server call failed
              router.replace('/');
            }
          },
        },
      ],
      { cancelable: true },
    );
  }

  if (iconOnly) {
    return (
      <TouchableOpacity
        style={[styles.iconBtn, style]}
        onPress={confirmLogout}
        activeOpacity={0.75}
      >
        <Ionicons name={iconName} size={iconSize} color="#fff" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.textBtn, style]} onPress={confirmLogout} activeOpacity={0.75}>
      <Ionicons name={iconName} size={iconSize} color="#fff" />
      {label && <Text style={styles.textBtnLabel}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.danger,
  },
  textBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
});