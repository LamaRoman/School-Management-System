import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hand a PDF to the user. On a phone it is written to the app's cache and the system share
 * sheet opens (view, print, save to Files, send on WhatsApp...). In a browser build, which is
 * only used for testing, it opens in a new tab instead.
 */
export async function openPdf(bytes: Uint8Array, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    window.open(url, '_blank');
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error("This device can't open or share files.");
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
}
