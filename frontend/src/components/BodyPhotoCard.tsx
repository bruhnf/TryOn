import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

interface Props {
  label: string;
  sublabel?: string;
  url?: string;
  loading?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export default function BodyPhotoCard({
  label,
  sublabel,
  url,
  loading,
  onPress,
  onLongPress,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={Colors.gray400} />
      ) : url ? (
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.plus}>+</Text>
          {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
        </View>
      )}

      <View style={styles.labelBar}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.gray100,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.gray200,
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
  },
  plus: { fontSize: 28, color: Colors.gray400 },
  sublabel: { fontSize: Typography.fontSizeXS, color: Colors.gray400, textAlign: 'center', marginTop: 4 },
  labelBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 5,
  },
  label: {
    color: Colors.white,
    fontSize: Typography.fontSizeXS,
    textAlign: 'center',
    fontWeight: Typography.fontWeightMedium,
  },
});
