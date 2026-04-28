import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { AuthStackParams } from '../navigation';
import { User } from '../types';

type Props = { navigation: NativeStackNavigationProp<AuthStackParams, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useUserStore((s) => s.setUser);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post<{ accessToken: string; refreshToken: string; user: User }>(
        '/auth/login',
        { email: email.trim().toLowerCase(), password },
      );
      await setUser(data.user, data.accessToken, data.refreshToken);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
          ?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Login failed. Please try again.';

      if (msg === 'EMAIL_NOT_VERIFIED') {
        Alert.alert(
          'Email Not Verified',
          'Please verify your email before logging in. Check your inbox.',
          [
            { text: 'Resend Email', onPress: () => resendVerification() },
            { text: 'OK' },
          ],
        );
      } else {
        Alert.alert('Login Failed', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    try {
      await api.post('/auth/resend-verification', { email: email.trim().toLowerCase() });
      Alert.alert('Sent', 'A verification email has been sent to your inbox.');
    } catch {
      Alert.alert('Error', 'Could not resend verification email.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>TryOn</Text>
        <Text style={styles.subtitle}>Virtual clothing try-on with AI</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.gray400}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.gray400}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text
              style={styles.linkText}
              onPress={() =>
                Alert.prompt?.('Forgot Password', 'Enter your email to reset your password', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Send',
                    onPress: async (e) => {
                      if (e) {
                        await api.post('/auth/forgot-password', { email: e });
                        Alert.alert('Sent', 'Check your email for a reset link.');
                      }
                    },
                  },
                ])
              }
            >
              Forgot password?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.mutedText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.linkText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  inner: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  title: {
    fontSize: 36,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  form: { gap: Spacing.md },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSizeMD,
    color: Colors.black,
    backgroundColor: Colors.gray100,
  },
  forgotLink: { alignSelf: 'flex-end' },
  primaryButton: {
    backgroundColor: Colors.black,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  disabled: { opacity: 0.6 },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeightSemiBold,
    fontSize: Typography.fontSizeMD,
  },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  mutedText: { color: Colors.gray600, fontSize: Typography.fontSizeMD },
  linkText: {
    color: Colors.black,
    fontWeight: Typography.fontWeightSemiBold,
    fontSize: Typography.fontSizeMD,
  },
});
