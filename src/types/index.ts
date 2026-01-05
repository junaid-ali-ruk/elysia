// File metadata type definitions

export type FileCategory = 'images' | 'documents' | 'videos' | 'audio' | 'others';

export interface FileMetadata {
    id: string;                    // unique nanoid
    originalName: string;          // original filename
    fileName: string;              // stored filename
    mimeType: string;
    size: number;                  // bytes
    category: FileCategory;
    path: string;                  // file system path
    url: string;                   // CDN URL
    thumbnailUrl?: string;
    width?: number;                // for images
    height?: number;               // for images
    uploadedAt: number;            // timestamp
    expiresAt?: number;
    downloads: number;
    isPublic: boolean;
    checksum: string;              // SHA-256 hash
    tags?: string[];
}

export interface UploadOptions {
    generateThumbnail?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;              // 1-100
    isPublic?: boolean;
    expiresIn?: number;            // seconds
    tags?: string[];
}

export interface ImageTransformOptions {
    width?: number;
    height?: number;
    quality?: number;              // 1-100
    format?: 'jpeg' | 'png' | 'webp' | 'avif';
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    blur?: number;
    grayscale?: boolean;
}

export interface StorageStats {
    totalFiles: number;
    totalSize: number;
    byCategory: Record<FileCategory, { count: number; size: number }>;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

export interface ListFilesParams {
    page?: number;
    limit?: number;
    category?: FileCategory | 'all';
    search?: string;
    sortBy?: 'uploadedAt' | 'size' | 'originalName' | 'downloads';
    sortOrder?: 'asc' | 'desc';
}
