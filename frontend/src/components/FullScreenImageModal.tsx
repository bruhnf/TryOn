import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

interface FullScreenImageModalProps {
  visible: boolean;
  imageUrls: string[];
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FullScreenImageModal({
  visible,
  imageUrls,
  initialIndex = 0,
  onClose,
}: FullScreenImageModalProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  if (imageUrls.length === 0) return null;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    if (index !== currentIndex && index >= 0 && index < imageUrls.length) {
      setCurrentIndex(index);
    }
  };

  const labels = ['Full Body', 'Medium'];

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
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 16 }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {/* Spacer below safe area + close button so the image starts where the controls end */}
        <View style={{ height: insets.top + 60 }} />

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentOffset={{ x: initialIndex * SCREEN_WIDTH, y: 0 }}
          style={styles.carousel}
        >
          {imageUrls.map((url, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          ))}
        </ScrollView>

        {/* Bottom spacer so the image doesn't sit underneath the pagination dots */}
        <View style={{ height: insets.bottom + (imageUrls.length > 1 ? 80 : 20) }} />

        {imageUrls.length > 1 && (
          <View style={[styles.pagination, { bottom: insets.bottom + 40 }]}>
            <Text style={styles.paginationLabel}>
              {labels[currentIndex] || `${currentIndex + 1} of ${imageUrls.length}`}
            </Text>
            <View style={styles.dots}>
              {imageUrls.map((_, index) => (
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

        <TouchableOpacity
          style={styles.tapArea}
          onPress={onClose}
          activeOpacity={1}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  carousel: {
    flex: 1,
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
  closeText: {
    fontSize: 20,
    color: Colors.white,
    fontWeight: '300',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  tapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  pagination: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
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
});
