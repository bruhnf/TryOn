/**
 * Photo library permission helpers.
 *
 * App Store Review Guideline 5.1.1(iv): once the user denies a permission
 * in the iOS system dialog, the app MUST NOT ask them to reconsider with
 * messages like "Please allow access." Apple's sanctioned pattern is:
 *
 *   1. Request the permission (iOS shows its system dialog the first time).
 *   2. If denied, show ONE informational notice with a link to iOS Settings.
 *      The user changes their mind there — not in our app.
 *   3. Never re-prompt or persuade.
 *
 * These helpers encapsulate that pattern so every photo-library entry point
 * behaves the same way and stays Apple-compliant.
 */
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

type EnsureResult = boolean;

/**
 * Ensure the app can READ from the photo library (e.g. to pick a photo via
 * ImagePicker.launchImageLibraryAsync). Resolves true if granted, false if
 * denied. When denied, shows a single Apple-compliant Settings prompt.
 *
 * @param rationale A short clause completing "TryOn uses your photo library to ___."
 *                  Example: "to upload your body photos".
 */
export async function ensurePhotoLibraryReadPermission(rationale: string): Promise<EnsureResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  presentSettingsNotice(rationale);
  return false;
}

/**
 * Ensure the app can SAVE to the photo library (e.g. to write a downloaded
 * try-on result into the user's gallery via MediaLibrary.createAssetAsync).
 * Same compliance pattern as the read helper.
 *
 * @param rationale Short clause completing "TryOn uses your photo library to ___."
 *                  Example: "to save try-on results to your gallery".
 */
export async function ensurePhotoLibrarySavePermission(rationale: string): Promise<EnsureResult> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'granted') return true;
  presentSettingsNotice(rationale);
  return false;
}

// ---- internals ------------------------------------------------------------

/**
 * Single informational alert shown after a denial. Wording is intentionally
 * neutral — it states the consequence and the recovery path (Settings) and
 * does NOT ask the user to reconsider. Two buttons: Cancel and Open Settings.
 */
function presentSettingsNotice(rationale: string): void {
  Alert.alert(
    'Photo Library Access',
    `TryOn uses your photo library ${rationale}. You can enable access in iOS Settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => {
          // Linking.openSettings() routes the user to this app's iOS Settings
          // page, where they can toggle Photos access. iOS handles the rest;
          // we do not poll or re-prompt afterward.
          Linking.openSettings().catch(() => {
            // openSettings can reject on some unusual configurations (e.g.
            // restricted devices). Silent catch — there is nothing we can do
            // and surfacing an error would frustrate the user further.
          });
        },
      },
    ],
    { cancelable: true },
  );
}
