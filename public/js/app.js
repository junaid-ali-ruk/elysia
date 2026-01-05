
// State
const state = {
    files: [],
    currentPage: 1,
    limit: 20,
    totalPages: 1,
    category: 'all',
    search: '',
    sortBy: 'uploadedAt',
    sortOrder: 'desc',
    uploadQueue: []
};

// Config
const API_URL = 'http://localhost:3000/api';
const CDN_URL = 'http://localhost:3000/cdn';

// DOM Elements
const elements = {
    statsContainer: document.getElementById('stats-container'),
    fileGrid: document.getElementById('file-grid'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('empty-state'),
    pagination: document.getElementById('pagination'),
    uploadModal: document.getElementById('upload-modal'),
    fileModal: document.getElementById('file-modal'),
    searchInput: document.getElementById('search-input'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    uploadPreview: document.getElementById('upload-preview'),
    uploadBtn: document.getElementById('upload-btn'),
    sortSelect: document.getElementById('sort-select')
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadFiles();
    setupUploadZone();

    // Add escape key listener for modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeUploadModal();
            closeFileModal();
        }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'upload-modal') closeUploadModal();
                if (overlay.id === 'file-modal') closeFileModal();
            }
        });
    });
});

// === API Calls ===

async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/files/stats/overview`);
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch stats:', err);
        return null;
    }
}

async function fetchFiles() {
    try {
        const params = new URLSearchParams({
            page: state.currentPage,
            limit: state.limit,
            category: state.category,
            search: state.search,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder
        });

        const res = await fetch(`${API_URL}/files?${params}`);
        return await res.json();
    } catch (err) {
        console.error('Failed to fetch files:', err);
        return { files: [], total: 0, totalPages: 0 };
    }
}

// === UI Rendering ===

async function loadStats() {
    const data = await fetchStats();
    if (!data || !data.success) return;

    const stats = data.data;
    const { totalFiles, totalSize, byCategory } = stats;

    elements.statsContainer.innerHTML = `
        <div class="stat-card">
            <span class="stat-label">Total Files</span>
            <span class="stat-value">${totalFiles}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Storage Used</span>
            <span class="stat-value">${formatBytes(totalSize)}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Images</span>
            <span class="stat-value">${byCategory.images.count}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">Documents</span>
            <span class="stat-value">${byCategory.documents.count}</span>
        </div>
    `;
}

async function loadFiles() {
    elements.loading.classList.remove('hidden');
    elements.fileGrid.innerHTML = '';
    elements.emptyState.classList.add('hidden');

    const data = await fetchFiles();
    elements.loading.classList.add('hidden');

    if (!data.files || data.files.length === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.pagination.innerHTML = '';
        return;
    }

    state.files = data.files;
    state.totalPages = data.totalPages;

    renderFiles(data.files);
    renderPagination();
}

function renderFiles(files) {
    elements.fileGrid.innerHTML = files.map(file => {
        const isImg = file.mimeType.startsWith('image/');
        const previewContent = file.thumbnailUrl
            ? `<img src="${file.thumbnailUrl}" loading="lazy" alt="${file.originalName}">`
            : `<i class="${getFileIcon(file.category)}"></i>`;

        return `
            <div class="file-card" onclick="showFileDetails('${file.id}')">
                <div class="file-preview">
                    ${previewContent}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${file.originalName}">${file.originalName}</div>
                    <div class="file-meta">
                        <span>${formatBytes(file.size)}</span>
                        <span>${formatDate(file.uploadedAt)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPagination() {
    if (state.totalPages <= 1) {
        elements.pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= state.totalPages; i++) {
        html += `
            <button class="page-btn ${i === state.currentPage ? 'active' : ''}" 
                onclick="changePage(${i})">${i}</button>
        `;
    }
    elements.pagination.innerHTML = html;
}

// === Actions ===

function handleSearch(e) {
    if (e.key === 'Enter') {
        state.search = e.target.value;
        state.currentPage = 1;
        loadFiles();
    }
}

function filterByCategory(category) {
    state.category = category;
    state.currentPage = 1;

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.textContent.toLowerCase().includes(category === 'all' ? 'all' : category)) {
            btn.classList.add('active');
        } else if (category === 'documents' && btn.textContent === 'Docs') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    loadFiles();
}

function handleSort() {
    const value = elements.sortSelect.value;
    const [sortBy, sortOrder] = value.split(':');
    state.sortBy = sortBy;
    state.sortOrder = sortOrder;
    loadFiles();
}

function changePage(page) {
    state.currentPage = page;
    loadFiles();
}

// === Upload Handling ===

function setupUploadZone() {
    const zone = elements.dropZone;

    zone.addEventListener('click', () => elements.fileInput.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
}

function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    state.uploadQueue = [...state.uploadQueue, ...files];
    renderUploadPreview();
    elements.uploadBtn.disabled = false;
}

function renderUploadPreview() {
    const container = elements.uploadPreview;
    container.innerHTML = state.uploadQueue.map((file, index) => `
        <div class="upload-item" style="display:flex; justify-content:space-between; padding:0.5rem; background:var(--bg-secondary); margin-bottom:0.5rem; border-radius:4px;">
            <span>${file.name} (${formatBytes(file.size)})</span>
            <button onclick="removeFromQueue(${index})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">&times;</button>
        </div>
    `).join('');
}

function removeFromQueue(index) {
    state.uploadQueue.splice(index, 1);
    renderUploadPreview();
    if (state.uploadQueue.length === 0) {
        elements.uploadBtn.disabled = true;
    }
}

async function uploadFiles() {
    if (state.uploadQueue.length === 0) return;

    elements.uploadBtn.disabled = true;
    elements.uploadBtn.textContent = 'Uploading...';

    const formData = new FormData();
    state.uploadQueue.forEach(file => formData.append('files', file));

    const thumbnail = document.getElementById('opt-thumbnail').checked;
    const isPublic = document.getElementById('opt-public').checked;

    try {
        const res = await fetch(`${API_URL}/upload/multiple?thumbnail=${thumbnail}&public=${isPublic}`, {
            method: 'POST',
            body: formData
        });

        const result = await res.json();

        if (result.success) {
            showToast(`Successfully uploaded ${result.data.length} files`, 'success');
            closeUploadModal();
            state.uploadQueue = [];
            renderUploadPreview();
            loadFiles();
            loadStats();
        } else {
            showToast(result.message || 'Upload failed', 'error');
        }
    } catch (err) {
        showToast('Upload failed', 'error');
        console.error(err);
    } finally {
        elements.uploadBtn.disabled = false;
        elements.uploadBtn.textContent = 'Upload Files';
    }
}

// === File Details ===

async function showFileDetails(id) {
    const file = state.files.find(f => f.id === id);
    if (!file) return;

    document.getElementById('file-modal-title').textContent = file.originalName;
    document.getElementById('file-id').value = file.id;
    document.getElementById('file-url').value = file.url;

    // Setup preview
    const previewContainer = document.getElementById('file-modal-preview');
    if (file.mimeType.startsWith('image/')) {
        previewContainer.innerHTML = `<img src="${file.url}" alt="${file.originalName}">`;
        document.getElementById('transform-presets').style.display = 'block';
    } else {
        previewContainer.innerHTML = `<i class="${getFileIcon(file.category)}" style="font-size: 5rem; color: var(--text-secondary)"></i>`;
        document.getElementById('transform-presets').style.display = 'none';
    }

    // Metadata
    const metaContainer = document.getElementById('file-metadata');
    metaContainer.innerHTML = `
        <div class="meta-item"><span>Size:</span> ${formatBytes(file.size)}</div>
        <div class="meta-item"><span>Type:</span> ${file.mimeType}</div>
        <div class="meta-item"><span>Date:</span> ${new Date(file.uploadedAt).toLocaleString()}</div>
        <div class="meta-item"><span>Downloads:</span> ${file.downloads}</div>
        ${file.width ? `<div class="meta-item"><span>Dimensions:</span> ${file.width}x${file.height}</div>` : ''}
    `;

    // Actions
    document.getElementById('btn-download').onclick = () => window.open(`${CDN_URL}/${file.id}/download`, '_blank');
    document.getElementById('btn-delete').onclick = () => deleteFile(file.id);

    // Show modal
    elements.fileModal.classList.add('active');
}

async function deleteFile(id) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
        const res = await fetch(`${API_URL}/files/${id}`, { method: 'DELETE' });
        const result = await res.json();

        if (result.success) {
            showToast('File deleted successfully', 'success');
            closeFileModal();
            loadFiles();
            loadStats();
        } else {
            showToast(result.message || 'Delete failed', 'error');
        }
    } catch (err) {
        showToast('Delete failed', 'error');
    }
}

function openPreset(preset) {
    const id = document.getElementById('file-id').value;
    window.open(`${CDN_URL}/${id}/${preset}`, '_blank');
}

// === Modals ===

function showUploadModal() {
    elements.uploadModal.classList.add('active');
}

function closeUploadModal() {
    elements.uploadModal.classList.remove('active');
    state.uploadQueue = [];
    renderUploadPreview();
    elements.uploadBtn.disabled = true;
}

function closeFileModal() {
    elements.fileModal.classList.remove('active');
}

// === Helpers ===

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    el.select();
    document.execCommand('copy');
    showToast('Copied to clipboard', 'success');
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;

    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // If less than 24 hours, show relative
    if (diff < 24 * 60 * 60 * 1000) {
        if (diff < 60 * 1000) return 'Just now';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
        return `${Math.floor(diff / 3600000)}h ago`;
    }

    return date.toLocaleDateString();
}

function getFileIcon(category) {
    switch (category) {
        case 'images': return 'fas fa-image';
        case 'documents': return 'fas fa-file-alt';
        case 'videos': return 'fas fa-video';
        case 'audio': return 'fas fa-music';
        default: return 'fas fa-file';
    }
}

// Expose functions to global scope
window.showUploadModal = showUploadModal;
window.closeUploadModal = closeUploadModal;
window.uploadFiles = uploadFiles;
window.handleFiles = handleFiles;
window.closeFileModal = closeFileModal;
window.copyToClipboard = copyToClipboard;
window.filterByCategory = filterByCategory;
window.handleSearch = handleSearch;
window.handleSort = handleSort;
window.showFileDetails = showFileDetails;
window.openPreset = openPreset;
window.changePage = changePage;
window.removeFromQueue = removeFromQueue;

console.log('App loaded');
