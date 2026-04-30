import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { useUserStore } from '../store/useUserStore';
import { RootStackParams } from '../navigation';

const MENU_ITEMS = [
  { key: 'edit', label: 'Edit Profile' },
  { key: 'settings', label: 'Settings' },
  { key: 'logout', label: 'Log Out', danger: true },
];

interface HeaderMenuProps {
  title?: string;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
  showMenu?: boolean;
}

export default function HeaderMenu({ 
  title, 
  leftComponent, 
  rightComponent,
  showMenu = true,
}: HeaderMenuProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { logout } = useUserStore();
  const [menuVisible, setMenuVisible] = useState(false);

  function handleMenuAction(key: string) {
    setMenuVisible(false);
    if (key === 'edit') navigation.navigate('EditProfile');
    if (key === 'settings') navigation.navigate('Settings');
    if (key === 'logout') {
      Alert.alert('Log Out', 'Are you sure you want to log out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: logout },
      ]);
    }
  }

  return (
    <>
      <View style={styles.header}>
        <View style={styles.left}>
          {leftComponent}
        </View>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <View style={styles.center} />
        )}
        <View style={styles.right}>
          {rightComponent}
          {showMenu && (
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuButton}>
              <Ionicons name="ellipsis-vertical" size={22} color={Colors.black} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal 
        transparent 
        visible={menuVisible} 
        animationType="fade" 
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          onPress={() => setMenuVisible(false)}
          activeOpacity={1}
        >
          <View style={styles.menuSheet}>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuItem}
                onPress={() => handleMenuAction(item.key)}
              >
                <Text style={[styles.menuItemText, item.danger && styles.menuItemDanger]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    flex: 1,
  },
  right: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.black,
    textAlign: 'center',
  },
  menuButton: {
    padding: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: 40,
    paddingTop: Spacing.md,
  },
  menuItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderColor: Colors.gray100,
  },
  menuItemText: {
    fontSize: Typography.fontSizeMD,
    color: Colors.black,
  },
  menuItemDanger: {
    color: Colors.danger,
  },
});
