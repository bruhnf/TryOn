import React from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

interface FullScreenImageModalProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FullScreenImageModal({
  visible,
  imageUrl,
  onClose,
}: FullScreenImageModalProps) {
  const insets = useSafeAreaInsets();

  if (!imageUrl) return null;

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

        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="contain"
        />

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
    justifyContent: 'center',
    alignItems: 'center',
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
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  tapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
});
