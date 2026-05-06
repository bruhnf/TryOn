import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Text,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { TryOnJob } from '../types';
import api from '../config/api';
import { downloadImageToGallery, downloadMultipleImages, shareImage } from '../utils/imageUtils';

interface TryOnDetailModalProps {
  visible: boolean;
  job: TryOnJob | null;
  onClose: () => void;
  onPrivacyChanged?: (jobId: string, isPrivate: boolean) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TryOnDetailModal({
  visible,
  job,
  onClose,
  onPrivacyChanged,
}: TryOnDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPrivate, setIsPrivate] = useState(job?.isPrivate ?? false);
  const [updating, setUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Reset state when job changes
  useEffect(() => {
    if (job) {
      setIsPrivate(job.isPrivate ?? false);
      setCurrentIndex(0);
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [job?.id]);

  if (!job) return null;

  const jobId = job.id;

  // Collect available images
  const images: { url: string; label: string }[] = [];
  if (job.resultFullBodyUrl) images.push({ url: job.resultFullBodyUrl, label: 'Full Body' });
  if (job.resultMediumUrl) images.push({ url: job.resultMediumUrl, label: 'Medium' });

  if (images.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
  };

  async function togglePrivacy() {
    const newValue = !isPrivate;
    setUpdating(true);
    try {
      await api.patch(`/tryon/${jobId}/privacy`, { isPrivate: newValue });
      setIsPrivate(newValue);
      onPrivacyChanged?.(jobId, newValue);
    } catch {
      Alert.alert('Error', 'Could not update privacy setting.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleDownloadCurrent() {
    if (downloading) return;
    setDownloading(true);
    const currentImage = images[currentIndex];
    const result = await downloadImageToGallery(
      currentImage.url,
      `TryOn_${currentImage.label.replace(/\s/g, '')}_${Date.now()}.jpg`
    );
    setDownloading(false);
    Alert.alert(result.success ? 'Saved!' : 'Error', result.message);
  }

  async function handleDownloadAll() {
    if (downloading || images.length < 2) return;
    setDownloading(true);
    const result = await downloadMultipleImages(images);
    setDownloading(false);
    Alert.alert(result.success ? 'Saved!' : 'Error', result.message);
  }

  async function handleShare() {
    const currentImage = images[currentIndex];
    await shareImage(currentImage.url);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />
      <View style={styles.overlay}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color={Colors.white} />
        </TouchableOpacity>

        {/* Spacer for safe area + close button row so the image starts below it */}
        <View style={{ height: insets.top + 60 }} />

        {/* Image carousel — fills remaining vertical space between header and controls */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.carousel}
        >
          {images.map((img, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image
                source={{ uri: img.url }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          ))}
        </ScrollView>

        {/* Bottom controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
          {/* Pagination */}
          {images.length > 1 && (
            <View style={styles.pagination}>
              <Text style={styles.paginationLabel}>{images[currentIndex].label}</Text>
              <View style={styles.dots}>
                {images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      index === currentIndex && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
              disabled={downloading}
            >
              <Ionicons name="share-outline" size={22} color={Colors.white} />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDownloadCurrent}
              disabled={downloading}
            >
              {downloading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Ionicons name="download-outline" size={22} color={Colors.white} />
              )}
              <Text style={styles.actionButtonText}>Save</Text>
            </TouchableOpacity>

            {images.length > 1 && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDownloadAll}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Ionicons name="images-outline" size={22} color={Colors.white} />
                )}
                <Text style={styles.actionButtonText}>Save All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Privacy toggle */}
          <View style={styles.privacyContainer}>
            <View style={styles.privacyInfo}>
              <Ionicons
                name={isPrivate ? 'lock-closed' : 'globe-outline'}
                size={20}
                color={Colors.white}
              />
              <View style={styles.privacyTextContainer}>
                <Text style={styles.privacyLabel}>
                  {isPrivate ? 'Private' : 'Public'}
                </Text>
                <Text style={styles.privacyHint}>
                  {isPrivate ? 'Only you can see this' : 'Visible on public feed'}
                </Text>
              </View>
            </View>
            {updating ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Switch
                value={isPrivate}
                onValueChange={togglePrivacy}
                trackColor={{ false: 'rgba(255,255,255,0.3)', true: Colors.white }}
                thumbColor={isPrivate ? Colors.black : Colors.white}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carousel: {
    flex: 1,
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH - 32,
    height: '100%',
    borderRadius: Radius.lg,
  },
  controls: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  pagination: {
    alignItems: 'center',
    marginBottom: 20,
  },
  paginationLabel: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    backgroundColor: Colors.white,
  },
  privacyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: Radius.md,
    padding: 16,
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  privacyTextContainer: {
    gap: 2,
  },
  privacyLabel: {
    color: Colors.white,
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemiBold,
  },
  privacyHint: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: Typography.fontSizeXS,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: Radius.md,
    minWidth: 70,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSizeXS,
    fontWeight: Typography.fontWeightMedium,
  },
});
