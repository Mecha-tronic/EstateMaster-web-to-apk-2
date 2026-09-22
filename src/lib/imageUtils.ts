/**
 * High-performance, client-side image compression & optimization utility.
 * Optimizes mobile camera & gallery images to fit safely within local storage,
 * Firestore document limits (<1MB), and HTTP request payloads.
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  cropToSquare?: boolean;
}

export function compressImageFile(
  file: File | Blob,
  options: CompressOptions = {}
): Promise<string> {
  const {
    maxWidth = 400,
    maxHeight = 400,
    quality = 0.85,
    cropToSquare = true,
  } = options;

  return new Promise((resolve, reject) => {
    // Basic file validation
    if (!file || !file.type.startsWith('image/')) {
      const fallbackReader = new FileReader();
      fallbackReader.onload = () => resolve(fallbackReader.result as string);
      fallbackReader.onerror = reject;
      fallbackReader.readAsDataURL(file);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement('canvas');
        let srcX = 0;
        let srcY = 0;
        let srcWidth = img.naturalWidth || img.width;
        let srcHeight = img.naturalHeight || img.height;

        let destWidth = srcWidth;
        let destHeight = srcHeight;

        if (cropToSquare) {
          // Crop centered square
          const minSide = Math.min(srcWidth, srcHeight);
          srcX = (srcWidth - minSide) / 2;
          srcY = (srcHeight - minSide) / 2;
          srcWidth = minSide;
          srcHeight = minSide;

          const targetSize = Math.min(maxWidth, maxHeight, minSide);
          destWidth = targetSize;
          destHeight = targetSize;
        } else {
          // Proportional scaling
          if (destWidth > maxWidth || destHeight > maxHeight) {
            const ratio = Math.min(maxWidth / destWidth, maxHeight / destHeight);
            destWidth = Math.round(destWidth * ratio);
            destHeight = Math.round(destHeight * ratio);
          }
        }

        canvas.width = Math.max(1, destWidth);
        canvas.height = Math.max(1, destHeight);

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          // Fallback to standard reader
          readAsRawDataUrl(file).then(resolve).catch(reject);
          return;
        }

        // Fill background with white in case of transparent PNG/WebP converted to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Smooth image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          0,
          0,
          destWidth,
          destHeight
        );

        // Export as JPEG with specified quality (usually results in 25KB - 60KB payload)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (canvasErr) {
        console.warn('Canvas compression warning, falling back to data URL:', canvasErr);
        readAsRawDataUrl(file).then(resolve).catch(reject);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      console.warn('Image element load error, falling back to standard read:', err);
      readAsRawDataUrl(file).then(resolve).catch(reject);
    };

    img.src = objectUrl;
  });
}

function readAsRawDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
