import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../config/api';
import { useUserStore } from '../store/useUserStore';
import { TryOnJob } from '../types';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

const POLL_INTERVAL_MS = 3000;

export default function TryOnScreen() {
  const insets = useSafeAreaInsets();
  const user = useUserStore((s) => s.user);

  const [clothingPhotos, setClothingPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<TryOnJob | null>(null);
  const [pollTimer, setPollTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const maxItems = user?.subscriptionLevel === 'BASIC' ? 1 : 2;

  useEffect(() => {
    return () => { if (pollTimer) clearTimeout(pollTimer); };
  }, [pollTimer]);

  function hasBodyPhoto(): boolean {
    return !!(user?.fullBodyUrl || user?.mediumBodyUrl);
  }

  async function pickClothingPhoto() {
    if (clothingPhotos.length >= maxItems) {
      Alert.alert(
        'Limit Reached',
        `Your ${user?.subscriptionLevel} plan supports up to ${maxItems} clothing item(s). Upgrade to add more.`,
      );
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
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setClothingPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
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

    setSubmitting(true);
    try {
      const formData = new FormData();
      for (const uri of clothingPhotos) {
        formData.append('photos', {
          uri,
          type: 'image/jpeg',
          name: 'clothing.jpg',
        } as unknown as Blob);
      }

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
      } else if (error?.error?.includes('limit')) {
        Alert.alert('Daily Limit Reached', error.error);
      } else {
        Alert.alert('Error', 'Could not submit try-on. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function pollJobStatus(jobId: string) {
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<TryOnJob>(`/tryon/${jobId}`);
        setActiveJob(data);
        if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          pollJobStatus(jobId);
        }
      } catch {
        // stop polling on error
      }
    }, POLL_INTERVAL_MS);
    setPollTimer(timer);
  }

  function resetTryOn() {
    setClothingPhotos([]);
    setActiveJob(null);
  }

  const noBodyPhotos = user && !hasBodyPhoto();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.inner, { paddingTop: insets.top + Spacing.md }]}
    >
      <Text style={styles.title}>Try On Clothes</Text>
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
          <Text style={styles.sectionLabel}>
            Clothing Photos{' '}
            <Text style={styles.planBadge}>
              ({maxItems} max on {user?.subscriptionLevel ?? 'BASIC'})
            </Text>
          </Text>

          <View style={styles.photoRow}>
            {clothingPhotos.map((uri, i) => (
              <View key={i} style={styles.photoSlot}>
                <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(i)}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.photoLabel}>Outfit {i + 1}</Text>
              </View>
            ))}

            {clothingPhotos.length < maxItems && (
              <TouchableOpacity style={styles.photoSlot} onPress={pickClothingPhoto}>
                <View style={styles.addPlaceholder}>
                  <Text style={styles.addPlus}>+</Text>
                  <Text style={styles.addLabel}>Add</Text>
                  <Text style={styles.addSublabel}>Photo {clothingPhotos.length + 1}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.helpText}>
            Take a photo of the clothing tag, the item on a rack, or on a hanger. The AI works
            best with clear, well-lit shots.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Body Photos Used</Text>
          <View style={styles.bodyPhotoStatus}>
            <StatusPill
              label="Full Body"
              active={!!user?.fullBodyUrl}
              primary
            />
            <StatusPill label="Waist Up" active={!!user?.mediumBodyUrl} />
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

  return (
    <View style={styles.resultContainer}>
      <Text style={styles.resultTitle}>Your Try-On Results</Text>
      {images.map((img) => (
        <View key={img.url} style={styles.resultImageWrap}>
          <Image source={{ uri: img.url }} style={styles.resultImage} resizeMode="contain" />
          <Text style={styles.resultLabel}>{img.label}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
        <Text style={styles.resetBtnText}>Try Another Outfit</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  inner: { padding: Spacing.xl },
  title: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    marginBottom: Spacing.xs,
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
  bodyPhotoStatus: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
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
