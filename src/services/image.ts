import sharp from 'sharp';
import { join } from 'path';
import { generateCacheKey } from '../utils/helpers';
import type { ImageTransformOptions } from '../types';

/**
 * Image processing service using Sharp
 */
class ImageService {
    private cacheDir = './cache';

    /**
     * Transform an image with the given options
     */
    async transform(inputPath: string, options: ImageTransformOptions): Promise<Buffer> {
        let pipeline = sharp(inputPath);

        // Apply resize if dimensions provided
        if (options.width || options.height) {
            pipeline = pipeline.resize({
                width: options.width,
                height: options.height,
                fit: options.fit || 'inside',
                withoutEnlargement: true,
            });
        }

        // Apply blur if specified (clamp to max 100)
        if (options.blur) {
            const blurAmount = Math.min(options.blur, 100);
            pipeline = pipeline.blur(blurAmount);
        }

        // Apply grayscale if true
        if (options.grayscale) {
            pipeline = pipeline.grayscale();
        }

        // Convert to format with quality
        const format = options.format || 'jpeg';
        const quality = options.quality || 80;

        switch (format) {
            case 'jpeg':
                pipeline = pipeline.jpeg({ quality });
                break;
            case 'png':
                pipeline = pipeline.png({ quality });
                break;
            case 'webp':
                pipeline = pipeline.webp({ quality });
                break;
            case 'avif':
                pipeline = pipeline.avif({ quality });
                break;
        }

        return pipeline.toBuffer();
    }

    /**
     * Generate a thumbnail for an image
     */
    async generateThumbnail(
        inputPath: string,
        outputPath: string,
        size: number = 200
    ): Promise<void> {
        await sharp(inputPath)
            .resize({
                width: size,
                height: size,
                fit: 'cover',
                position: 'center',
            })
            .jpeg({ quality: 80 })
            .toFile(outputPath);
    }

    /**
     * Get image metadata (dimensions)
     */
    async getMetadata(inputPath: string): Promise<{ width: number; height: number }> {
        const metadata = await sharp(inputPath).metadata();
        return {
            width: metadata.width || 0,
            height: metadata.height || 0,
        };
    }

    /**
     * Get cached transform or create new one
     */
    async getCachedTransform(
        fileId: string,
        inputPath: string,
        options: ImageTransformOptions
    ): Promise<{ buffer: Buffer; cached: boolean }> {
        const cacheKey = generateCacheKey(fileId, options as Record<string, unknown>);
        const cachePath = join(this.cacheDir, `${cacheKey}.${options.format || 'jpeg'}`);

        // Check if cached version exists
        const cacheFile = Bun.file(cachePath);
        if (await cacheFile.exists()) {
            const buffer = Buffer.from(await cacheFile.arrayBuffer());
            return { buffer, cached: true };
        }

        // Transform and cache
        const buffer = await this.transform(inputPath, options);
        await Bun.write(cachePath, buffer);

        return { buffer, cached: false };
    }

    /**
     * Clear cache for a specific file
     */
    async clearCache(fileId: string): Promise<void> {
        const { readdir, unlink } = await import('fs/promises');
        try {
            const files = await readdir(this.cacheDir);
            for (const file of files) {
                if (file.startsWith(fileId)) {
                    await unlink(join(this.cacheDir, file));
                }
            }
        } catch {
            // Cache dir might not exist or be empty
        }
    }
}

// Export singleton instance
export const imageService = new ImageService();
