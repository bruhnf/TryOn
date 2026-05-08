import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { TryOnJob } from '../types';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import FullScreenImageModal from '../components/FullScreenImageModal';
import CreditDisplay from '../components/CreditDisplay';
import { RootStackParams } from '../navigation';
import { processImageForUpload } from '../utils/imageUtils';

const POLL_INTERVAL_MS = 5000; // 5 seconds between polls
const MAX_POLL_ERRORS = 3; // Stop polling after this many consecutive errors

export default function TryOnScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const user = useUserStore((s) => s.user);

  const [clothingPhotos, setClothingPhotos] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<TryOnJob | null>(null);
  
  // Use refs for polling to avoid closure issues and ensure cleanup
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollErrorsRef = useRef(0);
  const isMountedRef = useRef(true);

  const maxItems = 1; // One clothing item per try-on

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  function hasBodyPhoto(): boolean {
    return !!(user?.fullBodyUrl || user?.mediumBodyUrl);
  }

  async function pickClothingPhoto() {
    if (clothingPhotos.length >= maxItems) {
      Alert.alert('Limit Reached', 'You can only add 1 photo per try-on.');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      // Fall back to library
      await pickFromLibrary();
      return;
    }

    Alert.alert('Add Clothing Photo', 'How would you like to add a clothing photo?', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function takePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setClothingPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setClothingPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function removePhoto(index: number) {
    setClothingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!hasBodyPhoto()) {
      Alert.alert(
        'Body Photos Required',
        'To use try-on, please upload a full body or waist-up photo in your Profile.',
      );
      return;
    }
    if (clothingPhotos.length === 0) {
      Alert.alert('No Clothing Photo', 'Please add at least one clothing photo.');
      return;
    }
    const hasDailyAllowance = user?.tier === 'BASIC' || user?.tier === 'PREMIUM';
    if (!hasDailyAllowance && (user?.credits ?? 0) <= 0) {
      Alert.alert(
        'Credits Required',
        'You need credits or a Basic/Premium subscription to use try-on.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Get Credits', onPress: () => navigation.navigate('Purchase') },
        ],
      );
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      
      // Process each photo to convert HEIF to JPEG
      for (const uri of clothingPhotos) {
        const processedImage = await processImageForUpload(uri, {
          maxWidth: 1536,
          maxHeight: 2048,
          compress: 0.85,
        });
        formData.append('photos', processedImage as unknown as Blob);
      }
      formData.append('isPrivate', isPrivate.toString());

      const { data } = await api.post<{ jobId: string; status: string }>('/tryon', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setActiveJob({ id: data.jobId, status: 'PENDING' } as TryOnJob);
      pollJobStatus(data.jobId);
    } catch (err: unknown) {
      const error =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      if (error?.error === 'NO_BODY_PHOTOS') {
        Alert.alert('Upload Body Photos', error.message ?? 'Please upload your body photos.');
      } else if (error?.error === 'SUBSCRIPTION_REQUIRED') {
        // Navigate to purchase screen instead of showing error
        Alert.alert(
          'Credits Required',
          'You need credits or a subscription to use try-on.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Get Credits', onPress: () => navigation.navigate('Purchase') },
          ],
        );
      } else if (error?.error === 'DAILY_LIMIT_REACHED') {
        Alert.alert(
          'Daily Limit Reached',
          error.message ?? 'You\'ve used all your daily try-ons. Get more credits to continue.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Get Credits', onPress: () => navigation.navigate('Purchase') },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not submit try-on. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pollJobStatus(jobId: string) {
    if (!isMountedRef.current) return;
    
    pollTimerRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;
      
      try {
        const { data } = await api.get<TryOnJob>(`/tryon/${jobId}`);
        if (!isMountedRef.current) return;
        
        setActiveJob(data);
        pollErrorsRef.current = 0; // Reset error count on success
        
        if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          pollJobStatus(jobId);
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        
        const status = (err as { response?: { status?: number } })?.response?.status;
        pollErrorsRef.current += 1;
        
        if (status === 429) {
          // Rate limited - wait longer before retrying
          console.log('Rate limited, waiting before retry...');
          pollTimerRef.current = setTimeout(() => pollJobStatus(jobId), 10000); // Wait 10 seconds
        } else if (pollErrorsRef.current < MAX_POLL_ERRORS) {
          // Retry on other errors
          pollJobStatus(jobId);
        } else {
          // Too many errors - show user a way to retry
          Alert.alert(
            'Connection Issue',
            'Unable to check job status. The job may still be processing.',
            [
              { text: 'Check Again', onPress: () => {
                pollErrorsRef.current = 0;
                pollJobStatus(jobId);
              }},
              { text: 'Start Over', onPress: resetTryOn, style: 'destructive' },
            ]
          );
        }
      }
    }, POLL_INTERVAL_MS);
  }

  function resetTryOn() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollErrorsRef.current = 0;
    setClothingPhotos([]);
    setIsPrivate(false);
    setActiveJob(null);
  }

  const noBodyPhotos = user && !hasBodyPhoto();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.inner, { paddingTop: insets.top + Spacing.md }]}
    >
      <View style={styles.headerRow}>
        <CreditDisplay onPress={() => navigation.navigate('Purchase')} />
        <Text style={styles.title}>Try On</Text>
        <View style={{ width: 50 }} />
      </View>
      <Text style={styles.subtitle}>
        Photograph an outfit or clothing item and see how it looks on you.
      </Text>

      {noBodyPhotos && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Upload a full body or waist-up photo in your Profile to enable try-on.
          </Text>
        </View>
      )}

      {!activeJob && (
        <>
          <Text style={styles.sectionLabel}>Clothing Photo</Text>

          <View style={styles.photoRow}>
            {clothingPhotos.map((uri, i) => (
              <View key={i} style={styles.photoSlot}>
                <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(i)}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {clothingPhotos.length < maxItems && (
              <TouchableOpacity style={styles.photoSlot} onPress={pickClothingPhoto}>
                <View style={styles.addPlaceholder}>
                  <Text style={styles.addPlus}>+</Text>
                  <Text style={styles.addLabel}>Add Photo</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.privacyRow}>
            <View style={styles.privacyInfo}>
              <Text style={styles.privacyLabel}>Keep Private</Text>
              <Text style={styles.privacyHint}>
                {isPrivate ? 'Only visible to you' : 'Visible on public feed'}
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: Colors.gray200, true: Colors.black }}
              thumbColor={Colors.white}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (submitting || noBodyPhotos) && styles.disabled]}
            onPress={handleSubmit}
            disabled={submitting || !!noBodyPhotos}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Generate Try-On</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {activeJob && (
        <ResultView job={activeJob} onReset={resetTryOn} />
      )}
    </ScrollView>
  );
}

function StatusPill({ label, active, primary }: { label: string; active: boolean; primary?: boolean }) {
  return (
    <View style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
      <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
        {active ? '✓' : primary ? '!' : '–'} {label}
      </Text>
    </View>
  );
}

function ResultView({ job, onReset }: { job: TryOnJob; onReset: () => void }) {
  const [fullScreenImages, setFullScreenImages] = useState<string[]>([]);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);
  const isPending = job.status === 'PENDING' || job.status === 'PROCESSING';
  const isFailed = job.status === 'FAILED';

  if (isFailed) {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultErrorTitle}>Generation Failed</Text>
        <Text style={styles.resultErrorText}>
          {job.errorMessage ?? 'Something went wrong. Please try again.'}
        </Text>
        <TouchableOpacity style={styles.submitBtn} onPress={onReset}>
          <Text style={styles.submitBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isPending) {
    return (
      <View style={styles.resultContainer}>
        <ActivityIndicator size="large" color={Colors.black} />
        <Text style={styles.generatingText}>Generating your try-on…</Text>
        <Text style={styles.generatingSubtext}>This usually takes 15–30 seconds.</Text>
      </View>
    );
  }

  const images = [
    job.resultFullBodyUrl && { label: 'Full Body', url: job.resultFullBodyUrl },
    job.resultMediumUrl && { label: 'Waist Up', url: job.resultMediumUrl },
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  const allUrls = images.map((img) => img.url);

  return (
    <View style={styles.resultContainer}>
      <Text style={styles.resultTitle}>Your Try-On Results</Text>
      {images.map((img, index) => (
        <TouchableOpacity
          key={img.url}
          style={styles.resultImageWrap}
          onPress={() => {
            setFullScreenImages(allUrls);
            setFullScreenIndex(index);
          }}
          activeOpacity={0.9}
        >
          <Image source={{ uri: img.url }} style={styles.resultImage} resizeMode="contain" />
          <Text style={styles.resultLabel}>{img.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
        <Text style={styles.resetBtnText}>Try Another Outfit</Text>
      </TouchableOpacity>
      <FullScreenImageModal
        visible={fullScreenImages.length > 0}
        imageUrls={fullScreenImages}
        initialIndex={fullScreenIndex}
        aiGenerated
        onClose={() => setFullScreenImages([])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  inner: { padding: Spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
  },
  subtitle: {
    fontSize: Typography.fontSizeMD,
    color: Colors.gray600,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  warningText: { fontSize: Typography.fontSizeSM, color: Colors.gray800, lineHeight: 20 },
  sectionLabel: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  planBadge: { fontWeight: Typography.fontWeightRegular, color: Colors.gray400 },
  photoRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  photoSlot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: Colors.white, fontSize: 11 },
  photoLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    color: Colors.white,
    fontSize: Typography.fontSizeXS,
    padding: 4,
    textAlign: 'center',
  },
  addPlaceholder: {
    flex: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray100,
  },
  addPlus: { fontSize: 28, color: Colors.gray400 },
  addLabel: { fontSize: Typography.fontSizeMD, color: Colors.gray600, fontWeight: Typography.fontWeightMedium },
  addSublabel: { fontSize: Typography.fontSizeXS, color: Colors.gray400 },
  helpText: {
    fontSize: Typography.fontSizeXS,
    color: Colors.gray400,
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  divider: { height: 1, backgroundColor: Colors.gray200, marginVertical: Spacing.lg },
  bodyPhotoStatus: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  privacyInfo: { flex: 1 },
  privacyLabel: {
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
  },
  privacyHint: {
    fontSize: Typography.fontSizeXS,
    color: Colors.gray600,
    marginTop: 2,
  },
  pill: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  pillActive: { backgroundColor: Colors.black },
  pillInactive: { backgroundColor: Colors.gray100 },
  pillText: { fontSize: Typography.fontSizeSM, fontWeight: Typography.fontWeightMedium },
  pillTextActive: { color: Colors.white },
  pillTextInactive: { color: Colors.gray600 },
  submitBtn: {
    backgroundColor: Colors.black,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  submitBtnText: {
    color: Colors.white,
    fontWeight: Typography.fontWeightSemiBold,
    fontSize: Typography.fontSizeMD,
  },
  resultContainer: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.lg },
  generatingText: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightSemiBold,
    color: Colors.black,
    marginTop: Spacing.md,
  },
  generatingSubtext: { fontSize: Typography.fontSizeSM, color: Colors.gray600 },
  resultTitle: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    alignSelf: 'flex-start',
  },
  resultImageWrap: { width: '100%', alignItems: 'center' },
  resultImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radius.lg },
  resultLabel: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    marginTop: Spacing.xs,
  },
  resultErrorTitle: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
    color: Colors.danger,
  },
  resultErrorText: {
    fontSize: Typography.fontSizeSM,
    color: Colors.gray600,
    textAlign: 'center',
    lineHeight: 20,
  },
  resetBtn: {
    borderWidth: 1.5,
    borderColor: Colors.black,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  resetBtnText: {
    color: Colors.black,
    fontWeight: Typography.fontWeightSemiBold,
    fontSize: Typography.fontSizeMD,
  },
});
