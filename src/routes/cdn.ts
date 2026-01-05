import { Elysia, t } from 'elysia';
import { storageService } from '../services/storage';
import { imageService } from '../services/image';
import { authMiddleware } from '../middleware/auth';
import type { ImageTransformOptions } from '../types';

// Preset configurations
const PRESETS: Record<string, ImageTransformOptions> = {
    small: { width: 150, height: 150, fit: 'cover', quality: 80 },
    medium: { width: 400, height: 400, fit: 'inside', quality: 85 },
    large: { width: 800, height: 800, fit: 'inside', quality: 90 },
    avatar: { width: 100, height: 100, fit: 'cover', quality: 80, format: 'webp' },
    banner: { width: 1200, height: 400, fit: 'cover', quality: 85, format: 'webp' },
    og: { width: 1200, height: 630, fit: 'cover', quality: 85 },
    blur: { width: 20, blur: 10, quality: 30 },
};

/**
 * CDN routes for serving files
 */
export const cdnRoutes = new Elysia({ prefix: '/cdn' })
    .use(authMiddleware)

    // GET /cdn/:id - Serve raw file
    .get('/:id', async ({ params, set, query, apiKey, isAuthenticated }: any) => {
        const result = await storageService.getFileContent(params.id);

        if (!result) {
            set.status = 404;
            return 'File not found';
        }

        const { file, metadata } = result;

        // Check permissions
        if (!metadata.isPublic && !isAuthenticated) {
            set.status = 403;
            return 'Unauthorized';
        }

        // Set headers
        set.headers['Content-Type'] = metadata.mimeType;
        set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        set.headers['ETag'] = `"${metadata.checksum}"`;

        // Handle download param
        if (query.download === 'true') {
            set.headers['Content-Disposition'] = `attachment; filename="${metadata.originalName}"`;
        }

        return file;
    })

    // GET /cdn/:id/download - Force download
    .get('/:id/download', async ({ params, set, apiKey, isAuthenticated }: any) => {
        const result = await storageService.getFileContent(params.id);

        if (!result) {
            set.status = 404;
            return 'File not found';
        }

        const { file, metadata } = result;

        if (!metadata.isPublic && !isAuthenticated) {
            set.status = 403;
            return 'Unauthorized';
        }

        set.headers['Content-Type'] = metadata.mimeType;
        set.headers['Content-Disposition'] = `attachment; filename="${metadata.originalName}"`;

        return file;
    })

    // GET /cdn/thumb/:id - Serve thumbnail
    .get('/thumb/:id', async ({ params, set }) => {
        const thumb = await storageService.getThumbnail(params.id);

        if (!thumb) {
            set.status = 404;
            return 'Thumbnail not found';
        }

        set.headers['Content-Type'] = 'image/jpeg';
        set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';

        return thumb;
    })

    // GET /cdn/:id/transform - Transform image
    .get(
        '/:id/transform',
        async ({ params, query, set }) => {
            const result = await storageService.getFileContent(params.id);

            if (!result) {
                set.status = 404;
                return 'File not found';
            }

            const { metadata } = result;

            // Only transform images
            if (!metadata.mimeType.startsWith('image/')) {
                set.status = 400;
                return 'Not an image';
            }

            const options: ImageTransformOptions = {
                width: query.w ? parseInt(query.w) : undefined,
                height: query.h ? parseInt(query.h) : undefined,
                quality: query.q ? parseInt(query.q) : undefined,
                format: query.f as any,
                fit: query.fit as any,
                blur: query.blur ? parseInt(query.blur) : undefined,
                grayscale: query.grayscale === 'true',
            };

            try {
                const { buffer, cached } = await imageService.getCachedTransform(
                    metadata.id,
                    metadata.path,
                    options
                );

                set.headers['Content-Type'] = `image/${options.format || 'jpeg'}`;
                set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
                set.headers['X-Cache'] = cached ? 'HIT' : 'MISS';

                return new Response(buffer as any);
            } catch (error) {
                set.status = 500;
                return 'Transformation failed';
            }
        },
        {
            query: t.Object({
                w: t.Optional(t.String()),
                h: t.Optional(t.String()),
                q: t.Optional(t.String()),
                f: t.Optional(t.String()),
                fit: t.Optional(t.String()),
                blur: t.Optional(t.String()),
                grayscale: t.Optional(t.String()),
                download: t.Optional(t.String()),
            }),
        }
    )

    // GET /cdn/:id/:preset - Use transformation preset
    .get('/:id/:preset', async ({ params, set }) => {
        const preset = PRESETS[params.preset];
        if (!preset) {
            set.status = 404;
            return 'Preset not found';
        }

        const result = await storageService.getFileContent(params.id);

        if (!result) {
            set.status = 404;
            return 'File not found';
        }

        const { metadata } = result;

        if (!metadata.mimeType.startsWith('image/')) {
            return Bun.file(metadata.path); // Return original if not image
        }

        try {
            const { buffer, cached } = await imageService.getCachedTransform(
                metadata.id,
                metadata.path,
                preset
            );

            set.headers['Content-Type'] = `image/${preset.format || 'jpeg'}`;
            set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
            set.headers['X-Cache'] = cached ? 'HIT' : 'MISS';

            return new Response(buffer as any);
        } catch (error) {
            set.status = 500;
            return 'Transformation failed';
        }
    });
