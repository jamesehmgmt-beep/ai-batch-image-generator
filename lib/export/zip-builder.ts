// lib/export/zip-builder.ts
import archiver from 'archiver';

export interface ZipEntry {
  name: string;        // Full path in ZIP (e.g., "folder/subfolder/file.png")
  url: string;         // URL to fetch content from
  skipOnError?: boolean; // Continue if this file fails to fetch (default: true)
}

export interface ZipBuilderOptions {
  compressionLevel?: number;  // 0-9, default 6
  onProgress?: (processed: number, total: number) => void;
  onError?: (entry: ZipEntry, error: Error) => void;
}

/**
 * Create a streaming ZIP archive from a list of URLs
 * Returns a ReadableStream that can be directly returned in NextResponse
 */
export function createStreamingZip(
  entries: ZipEntry[],
  options: ZipBuilderOptions = {}
): ReadableStream<Uint8Array> {
  const { compressionLevel = 6, onProgress, onError } = options;

  const archive = archiver('zip', {
    zlib: { level: compressionLevel }
  });

  let processed = 0;
  const total = entries.length;

  // Create ReadableStream from archiver events
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });

      archive.on('end', () => {
        controller.close();
      });

      archive.on('error', (err: Error) => {
        console.error('[ZipBuilder] Archive error:', err);
        controller.error(err);
      });
    }
  });

  // Fetch and append files asynchronously
  (async () => {
    for (const entry of entries) {
      try {
        const response = await fetch(entry.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        archive.append(buffer, { name: entry.name });

        processed++;
        onProgress?.(processed, total);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[ZipBuilder] Failed to fetch ${entry.name}:`, err.message);
        onError?.(entry, err);

        if (entry.skipOnError === false) {
          archive.destroy();
          return;
        }
      }
    }

    // Finalize archive (triggers 'end' event)
    await archive.finalize();
  })();

  return stream;
}
