import { describe, expect, it } from 'vitest';
import path from 'node:path';

import {
  detectImageExtension,
  isManagedUploadPath,
  resolveManagedUpload,
} from '../platform-core/src/image-storage';

describe('self-hosted image storage', () => {
  it('accepts supported image signatures rather than trusting the browser MIME type', () => {
    expect(detectImageExtension(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(detectImageExtension(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectImageExtension(new TextEncoder().encode('RIFF0000WEBP'))).toBe('webp');
    expect(detectImageExtension(new TextEncoder().encode('0000ftypavif'))).toBe('avif');
    expect(detectImageExtension(new TextEncoder().encode('<script>alert(1)</script>'))).toBeNull();
  });

  it('keeps deletion paths inside the selected workspace directory', () => {
    const root = path.resolve('uploads');
    expect(resolveManagedUpload(root, 'ws-1', 'ws-1/galleries/photo.jpg')).toBe(
      path.join(root, 'ws-1', 'galleries', 'photo.jpg'),
    );
    expect(resolveManagedUpload(root, 'ws-1', '../ws-2/private.jpg')).toBeNull();
    expect(resolveManagedUpload(root, 'ws-1', 'ws-2/private.jpg')).toBeNull();
    expect(resolveManagedUpload(root, 'ws-1', 'ws-1/../../private.jpg')).toBeNull();
  });

  it('accepts only tenant-owned normalized object keys', () => {
    expect(isManagedUploadPath('ws-1', 'ws-1/galleries/photo.webp')).toBe(true);
    expect(isManagedUploadPath('ws-1', 'ws-2/galleries/photo.webp')).toBe(false);
    expect(isManagedUploadPath('ws-1', 'ws-1/photo.webp')).toBe(false);
    expect(isManagedUploadPath('ws-1', 'ws-1/galleries/../photo.webp')).toBe(false);
    expect(isManagedUploadPath('ws-1', 'ws-1/galleries/photo name.webp')).toBe(false);
    expect(isManagedUploadPath('ws-1', `ws-1/galleries/${'a'.repeat(500)}.webp`)).toBe(false);
  });
});
