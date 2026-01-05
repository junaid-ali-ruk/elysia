import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { uploadRoutes } from './routes/upload';
import { filesRoutes } from './routes/files';
import { cdnRoutes } from './routes/cdn';
import { storageService } from './services/storage';

const PORT = 3000;

// Initialize storage
await storageService.init();

const app = new Elysia()
    // Global Middleware
    .use(cors())
    .use(staticPlugin({
        assets: 'public',
        prefix: '/'
    }))

    // Serve index.html at root
    .get('/', () => Bun.file('public/index.html'))

    // Routes
    .use(uploadRoutes)
    .use(filesRoutes)
    .use(cdnRoutes)

    // Health check
    .get('/health', async () => {
        const stats = await storageService.getStats();
        return {
            status: 'ok',
            uptime: process.uptime(),
            files: stats.totalFiles,
            storage: stats.totalSize,
        };
    })

    // API Documentation
    .get('/api', () => ({
        name: 'File Upload & CDN API',
        version: '1.0.0',
        endpoints: {
            upload: {
                single: 'POST /api/upload/single',
                multiple: 'POST /api/upload/multiple',
                url: 'POST /api/upload/url',
                base64: 'POST /api/upload/base64',
            },
            files: {
                list: 'GET /api/files',
                details: 'GET /api/files/:id',
                update: 'PATCH /api/files/:id',
                delete: 'DELETE /api/files/:id',
            },
            cdn: {
                view: 'GET /cdn/:id',
                download: 'GET /cdn/:id/download',
                transform: 'GET /cdn/:id/transform',
                preset: 'GET /cdn/:id/:preset',
            }
        }
    }))

    // Error handling
    .onError(({ code, error, set }) => {
        if (code === 'VALIDATION') {
            set.status = 400;
            return {
                success: false,
                error: 'Validation Error',
                message: error.message,
            };
        }

        if (code === 'NOT_FOUND') {
            set.status = 404;
            return {
                success: false,
                error: 'Not Found',
                message: 'Resource not found',
            };
        }

        console.error('Server error:', error);
        set.status = 500;
        return {
            success: false,
            error: 'Internal Server Error',
            message: 'Something went wrong',
        };
    })

    .listen(PORT);

console.log(
    `🚀 File Upload & CDN API is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(`📂 Dashboard available at http://localhost:${PORT}`);
