import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Getting a report card PDF onto the phone.
//  - Android: saved straight into a folder the teacher chose once (pick "Downloads"); the
//    choice is remembered. Android only lets an app write to a folder the user picked.
//  - iPhone: apps cannot write to a Downloads folder, so the system share sheet opens
//    (it has "Save to Files").
//  - Browser (testing only): opens in a new tab.

const FOLDER_KEY = 'pdfFolder';
interface SavedFolder { uri: string; name: string }

export type SaveResult =
  | { kind: 'saved'; filename: string; folderName: string }
  | { kind: 'shared' }
  | { kind: 'opened' };

/** The user dismissed the folder picker. Not an error worth showing. */
export class FolderPickCancelled extends Error {
  constructor() { super('cancelled'); }
}

export const canChooseFolder = Platform.OS === 'android';

export async function getSavedFolderName(): Promise<string | null> {
  return (await readFolder())?.name ?? null;
}

async function readFolder(): Promise<SavedFolder | null> {
  try {
    const raw = await AsyncStorage.getItem(FOLDER_KEY);
    return raw ? (JSON.parse(raw) as SavedFolder) : null;
  } catch {
    return null;
  }
}

/** Ask the user for a folder (Android) and remember it. */
export async function chooseFolder(): Promise<SavedFolder> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    throw new FolderPickCancelled();
  }
  const folder = { uri: dir.uri, name: dir.name || 'the chosen folder' };
  await AsyncStorage.setItem(FOLDER_KEY, JSON.stringify(folder));
  return folder;
}

function writeInto(folder: SavedFolder, bytes: Uint8Array, filename: string): void {
  const file = new Directory(folder.uri).createFile(filename, 'application/pdf');
  file.write(bytes);
}

export async function savePdf(bytes: Uint8Array, filename: string): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    window.open(url, '_blank');
    return { kind: 'opened' };
  }

  if (Platform.OS === 'android') {
    let folder = await readFolder();
    if (folder) {
      try {
        writeInto(folder, bytes, filename);
        return { kind: 'saved', filename, folderName: folder.name };
      } catch {
        // The folder was deleted or its permission revoked — fall through and ask again.
      }
    }
    folder = await chooseFolder();
    writeInto(folder, bytes, filename);
    return { kind: 'saved', filename, folderName: folder.name };
  }

  await sharePdf(bytes, filename);
  return { kind: 'shared' };
}

/** Open the system share sheet for a PDF (view, print, send, save to Files). */
export async function sharePdf(bytes: Uint8Array, filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error("This device can't open or share files.");
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
}
