'use client'

export interface LocalMusicFile {
  name: string
  handle: FileSystemFileHandle
  size: number
}

const IDB_DB = 'eveoke-fs'
const IDB_STORE = 'handles'
const FOLDER_KEY = 'music-root'
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)$/i

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickMusicFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'read', startIn: 'music' })
    await saveHandle(handle)
    return handle
  } catch { return null }
}

export async function loadSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const handle: FileSystemDirectoryHandle = await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(FOLDER_KEY)
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    if (!handle) return null
    const perm = await (handle as any).queryPermission({ mode: 'read' })
    if (perm === 'granted') return handle
    const req2 = await (handle as any).requestPermission({ mode: 'read' })
    return req2 === 'granted' ? handle : null
  } catch { return null }
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(handle, FOLDER_KEY)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export async function scanAudioFiles(dir: FileSystemDirectoryHandle): Promise<LocalMusicFile[]> {
  const files: LocalMusicFile[] = []
  for await (const [name, entry] of (dir as any).entries()) {
    if (entry.kind === 'file' && AUDIO_EXT.test(name)) {
      try {
        const file = await (entry as FileSystemFileHandle).getFile()
        files.push({ name, handle: entry as FileSystemFileHandle, size: file.size })
      } catch { /* skip unreadable files */ }
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

export function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)}KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
