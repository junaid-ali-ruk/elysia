import { Elysia, t } from 'elysia';
import { storageService } from '../services/storage';
import { authMiddleware } from '../middleware/auth';
import type { UploadOptions } from '../types';

/**
 * Upload API routes
 */
export const uploadRoutes = new Elysia({ prefix: '/api/upload' })
    .use(authMiddleware)

    // POST /api/upload/single - Upload a single file
    .post(
        '/single',
        async ({ body, query }) => {
            try {
                const file = body.file;
                if (!file) {
                    return {
                        success: false,
                        error: 'Validation',
                        message: 'No file provided',
                    };
                }

                const options: UploadOptions = {
                    generateThumbnail: query.thumbnail !== 'false',
                    isPublic: query.public !== 'false',
                    tags: query.tags ? query.tags.split(',').map(t => t.trim()) : undefined,
                    maxWidth: query.maxWidth ? parseInt(query.maxWidth) : undefined,
                    maxHeight: query.maxHeight ? parseInt(query.maxHeight) : undefined,
                    quality: query.quality ? parseInt(query.quality) : undefined,
                    expiresIn: query.expiresIn ? parseInt(query.expiresIn) : undefined,
                };

                const metadata = await storageService.upload(file, options);

                return {
                    success: true,
                    data: metadata,
                    message: 'File uploaded successfully',
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Upload Failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
        {
            body: t.Object({
                file: t.File(),
            }),
            query: t.Object({
                thumbnail: t.Optional(t.String()),
                public: t.Optional(t.String()),
                tags: t.Optional(t.String()),
                maxWidth: t.Optional(t.String()),
                maxHeight: t.Optional(t.String()),
                quality: t.Optional(t.String()),
                expiresIn: t.Optional(t.String()),
            }),
        }
    )

    // POST /api/upload/multiple - Upload multiple files
    .post(
        '/multiple',
        async ({ body, query }) => {
            try {
                const files = body.files;
                if (!files || files.length === 0) {
                    return {
                        success: false,
                        error: 'Validation',
                        message: 'No files provided',
                    };
                }

                const options: UploadOptions = {
                    generateThumbnail: query.thumbnail !== 'false',
                    isPublic: query.public !== 'false',
                    tags: query.tags ? query.tags.split(',').map(t => t.trim()) : undefined,
                };

                const results = await storageService.uploadMultiple(files, options);

                return {
                    success: true,
                    data: results,
                    message: `${results.length} files uploaded successfully`,
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Upload Failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
        {
            body: t.Object({
                files: t.Files(),
            }),
            query: t.Object({
                thumbnail: t.Optional(t.String()),
                public: t.Optional(t.String()),
                tags: t.Optional(t.String()),
            }),
        }
    )

    // POST /api/upload/url - Upload from URL
    .post(
        '/url',
        async ({ body, query }) => {
            try {
                const { url, filename } = body;

                // Fetch the URL
                const response = await fetch(url);
                if (!response.ok) {
                    return {
                        success: false,
                        error: 'Fetch Failed',
                        message: `Failed to fetch URL: ${response.statusText}`,
                    };
                }

                const blob = await response.blob();
                const contentType = response.headers.get('content-type') || 'application/octet-stream';

                // Generate filename from URL if not provided
                const urlPath = new URL(url).pathname;
                const name = filename || urlPath.split('/').pop() || 'downloaded_file';

                // Create File object
                const file = new File([blob], name, { type: contentType });

                const options: UploadOptions = {
                    generateThumbnail: query.thumbnail !== 'false',
                    isPublic: query.public !== 'false',
                    tags: query.tags ? query.tags.split(',').map(t => t.trim()) : undefined,
                };

                const metadata = await storageService.upload(file, options);

                return {
                    success: true,
                    data: metadata,
                    message: 'File uploaded from URL successfully',
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Upload Failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
        {
            body: t.Object({
                url: t.String(),
                filename: t.Optional(t.String()),
            }),
            query: t.Object({
                thumbnail: t.Optional(t.String()),
                public: t.Optional(t.String()),
                tags: t.Optional(t.String()),
            }),
        }
    )

    // POST /api/upload/base64 - Upload base64 encoded data
    .post(
        '/base64',
        async ({ body, query }) => {
            try {
                const { data, filename, mimeType } = body;

                // Decode base64
                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Create File object
                const file = new File([bytes], filename, { type: mimeType });

                const options: UploadOptions = {
                    generateThumbnail: query.thumbnail !== 'false',
                    isPublic: query.public !== 'false',
                    tags: query.tags ? query.tags.split(',').map(t => t.trim()) : undefined,
                };

                const metadata = await storageService.upload(file, options);

                return {
                    success: true,
                    data: metadata,
                    message: 'File uploaded from base64 successfully',
                };
            } catch (error) {
                return {
                    success: false,
                    error: 'Upload Failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
        {
            body: t.Object({
                data: t.String(),
                filename: t.String(),
                mimeType: t.String(),
            }),
            query: t.Object({
                thumbnail: t.Optional(t.String()),
                public: t.Optional(t.String()),
                tags: t.Optional(t.String()),
            }),
        }
    );
