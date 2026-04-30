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
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { AuthStackParams } from '../navigation';

type Props = { navigation: NativeStackNavigationProp<AuthStackParams, 'Signup'> };

export default function SignupScreen({ navigation }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!username.trim() || !email.trim() || !password) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (!agreed) {
      Alert.alert('Error', 'Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    // Validate password requirements before sending
    const passwordErrors: string[] = [];
    if (password.length < 8) passwordErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter');
    if (!/[0-9]/.test(password)) passwordErrors.push('one number');
    if (!/[^A-Za-z0-9]/.test(password)) passwordErrors.push('one special character');
    if (passwordErrors.length > 0) {
      Alert.alert('Password Requirements', `Password must contain ${passwordErrors.join(', ')}.`);
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/signup', {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      Alert.alert(
        'Account Created',
        'Please check your email to verify your account, then log in.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: unknown; message?: string } } })?.response?.data;
      let errorMessage = 'Signup failed. Please try again.';
      
      if (response?.error) {
        if (typeof response.error === 'string') {
          errorMessage = response.error;
        } else if (typeof response.error === 'object') {
          // Handle Zod validation errors
          const zodError = response.error as { fieldErrors?: Record<string, string[]> };
          const fieldErrors = zodError.fieldErrors;
          if (fieldErrors) {
            const messages = Object.entries(fieldErrors)
              .map(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
              .join('\n');
            errorMessage = messages || errorMessage;
          }
        }
      } else if (response?.message) {
        errorMessage = response.message;
      }
      
      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Just the basics to get started. You can always add more later.
        </Text>

        <View style={styles.form}>
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, styles.nameInput]}
              placeholder="First Name"
              placeholderTextColor={Colors.gray400}
              autoCapitalize="words"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={[styles.input, styles.nameInput]}
              placeholder="Last Name"
              placeholderTextColor={Colors.gray400}
              autoCapitalize="words"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={Colors.gray400}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
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
          <Text style={styles.passwordHint}>
            8+ characters, one uppercase, one number, one special character
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor={Colors.gray400}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />

          <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed(!agreed)}>
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>
              I agree to the{' '}
              <Text style={styles.linkText}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.linkText}>Privacy Policy</Text>, including the processing
              of body photos by AI services.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.disabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.mutedText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  inner: { flexGrow: 1, padding: Spacing.xl, paddingTop: Spacing.xxl },
  backButton: { marginBottom: Spacing.lg },
  backText: { fontSize: Typography.fontSizeMD, color: Colors.gray600 },
  title: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  form: { gap: Spacing.md },
  nameRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  nameInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSizeMD,
    color: Colors.black,
    backgroundColor: Colors.gray100,
  },
  passwordHint: { fontSize: Typography.fontSizeXS, color: Colors.gray400, marginTop: -Spacing.sm },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: Colors.black, borderColor: Colors.black },
  checkmark: { color: Colors.white, fontSize: 13, fontWeight: Typography.fontWeightBold },
  checkLabel: { flex: 1, fontSize: Typography.fontSizeSM, color: Colors.gray600, lineHeight: 20 },
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
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.md },
  mutedText: { color: Colors.gray600, fontSize: Typography.fontSizeMD },
  linkText: { color: Colors.black, fontWeight: Typography.fontWeightSemiBold },
});
