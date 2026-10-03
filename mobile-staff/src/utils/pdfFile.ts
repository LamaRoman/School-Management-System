import { Platform, Linking } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, API_BASE } from '../api/client';

// Getting a report card PDF onto the phone.
//  - Android: ask the server for a short-lived download link and open it in the phone's
//    browser. The browser then downloads it straight into Downloads, like any other download.
//    (An app cannot write into Downloads itself without a native build, and the link carries
//    no login — see backend/src/services/pdfLink.service.ts.)
//  - iPhone: apps cannot write to Downloads, so the PDF is fetched with the app's own login and
//    the system share sheet opens (it has "Save to Files").
//  - Browser (testing only): opens in a new tab.

/** Android: the browser takes over the download. Resolves once the browser has been opened. */
export async function downloadInBrowser(pdfPath: string): Promise<void> {
  const { url } = await api.post<{ url: string; expiresInSeconds: number }>('/pdf/link', { path: pdfPath });
  await Linking.openURL(`${API_BASE}${url}`);
}

export const usesBrowserDownload = Platform.OS === 'android';

/** iPhone / browser: hand already-downloaded bytes to the user. */
export async function openPdfBytes(bytes: Uint8Array, filename: string): Promise<void> {
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
