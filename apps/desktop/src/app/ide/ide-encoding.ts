import { atom } from 'nanostores'

import { readKey, writeKey } from '@/lib/storage'

export const FILE_ENCODINGS = ['utf-8', 'gbk', 'gb2312', 'big5', 'utf-16le'] as const

export type FileEncoding = (typeof FILE_ENCODINGS)[number]

const STORAGE_KEY = 'hermes.desktop.ide.encoding'

function loadEncoding(): FileEncoding {
  const raw = readKey(STORAGE_KEY)

  return FILE_ENCODINGS.includes(raw as FileEncoding) ? (raw as FileEncoding) : 'utf-8'
}

export const $fileEncoding = atom<FileEncoding>(loadEncoding())

export function setFileEncoding(encoding: FileEncoding) {
  $fileEncoding.set(encoding)
  writeKey(STORAGE_KEY, encoding)
}

const LABELS: Record<FileEncoding, string> = {
  big5: 'Big5',
  gb2312: 'GB2312',
  gbk: 'GBK',
  'utf-16le': 'UTF-16 LE',
  'utf-8': 'UTF-8'
}

export function encodingLabel(encoding: FileEncoding) {
  return LABELS[encoding]
}
