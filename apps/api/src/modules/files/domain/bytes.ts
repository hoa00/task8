import type { UploadProjectFileInput } from '@studio/contracts/api';
import { ApiFailure } from '../../../shared/errors.ts';
import { apiLimits } from '../../../shared/limits.ts';
export const invalidName = (name: string) =>
  [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\');
export const safeInline = (mime: string) =>
  ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);
export function validateBytes(file: UploadProjectFileInput['file']) {
  if (file.bytes.byteLength > apiLimits.maxUploadBytes)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'File exceeds 10 MiB');
  if (invalidName(file.name) || !/^[-\w.+]+\/[-\w.+]+$/u.test(file.mimeType))
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid file name or media type');
  const b = file.bytes,
    m = file.mimeType.toLowerCase();
  if (
    (m === 'image/png' && ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n)) ||
    (m === 'image/jpeg' && !(b[0] === 255 && b[1] === 216 && b[2] === 255)) ||
    (m === 'image/gif' &&
      !['GIF87a', 'GIF89a'].includes(new TextDecoder().decode(b.slice(0, 6)))) ||
    (m === 'image/webp' &&
      !(
        new TextDecoder().decode(b.slice(0, 4)) === 'RIFF' &&
        new TextDecoder().decode(b.slice(8, 12)) === 'WEBP'
      ))
  )
    throw new ApiFailure('VALIDATION_ERROR', 'File bytes do not match the preview media type');
}
