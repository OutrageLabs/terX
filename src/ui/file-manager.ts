// file-manager.ts
// Główny komponent file managera - dual-pane jako osobna karta (tab)

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
    FileManagerState,
    FileEntry,
    DirectoryListing,
    PanelState,
    QueuedTransfer,
    TransferProgress,
    createInitialState,
    createInitialPanelState,
    formatFileSize,
    formatDate,
    sortEntries,
    getFileIcon,
} from '../lib/file-manager-state';
import { t } from '../i18n';
import { showDialog, showConfirm, inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonDangerClasses } from './dialogs';

// Helper do escape HTML
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Singleton state
let state: FileManagerState = createInitialState();
let container: HTMLElement | null = null;
let unlisteners: UnlistenFn[] = [];

// Event callbacks dla tab-bar
type FileManagerEventListener = (event: 'opened' | 'closed' | 'activated', data?: { tabId?: string }) => void;
let eventListeners: Set<FileManagerEventListener> = new Set();

/**
 * Inicjalizuje file manager
 */
export function initFileManager(): void {
    // Kontener w #terminal-container (obok kontenerów terminali)
    const terminalContainer = document.getElementById('terminal-container');
    if (!terminalContainer) {
        console.error('[FileManager] #terminal-container not found');
        return;
    }

    container = document.createElement('div');
    container.id = 'file-manager-container';
    container.className = 'fm-tab-container'; // Nowa klasa dla trybu tab
    terminalContainer.appendChild(container);

    // Keyboard handler
    document.addEventListener('keydown', handleGlobalKeydown);
}

/**
 * Subskrybuj eventy file managera (dla tab-bar)
 */
export function onFileManagerEvent(listener: FileManagerEventListener): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
}

/**
 * Emituj event
 */
function emitEvent(event: 'opened' | 'closed' | 'activated', data?: { tabId?: string }): void {
    for (const listener of eventListeners) {
        try {
            listener(event, data);
        } catch (e) {
            console.error('[FileManager] Event listener error:', e);
        }
    }
}

/**
 * Generuj ID taba dla file managera
 */
export function getFileManagerTabId(sshSessionId: string): string {
    return `fm:${sshSessionId}`;
}

/**
 * Sprawdź czy ID to tab file managera
 */
export function isFileManagerTabId(tabId: string): boolean {
    return tabId.startsWith('fm:');
}

/**
 * Wyciągnij SSH session ID z taba file managera
 */
export function getSshSessionIdFromTabId(tabId: string): string | null {
    if (!isFileManagerTabId(tabId)) return null;
    return tabId.substring(3); // Usuń 'fm:'
}

/**
 * Pokazuje file manager dla danej sesji SSH
 */
export async function showFileManager(sshSessionId: string): Promise<void> {
    if (!container) {
        initFileManager();
    }

    const tabId = getFileManagerTabId(sshSessionId);

    // Jeśli już otwarty dla tej sesji, tylko aktywuj
    if (state.visible && state.sshSessionId === sshSessionId) {
        activateFileManager();
        return;
    }

    state.sshSessionId = sshSessionId;
    state.visible = true;

    // Reset paneli
    state.leftPanel = createInitialPanelState('local');
    state.rightPanel = createInitialPanelState('remote');
    state.activePanel = 'left';
    state.transfers = [];

    // Render UI
    render();

    // Aktywuj kontener (pokaż jako aktywny tab)
    activateFileManager();

    // Otwórz SFTP session
    try {
        state.sftpSessionId = await invoke<string>('sftp_open', { sshSessionId });

        // Załaduj początkowe katalogi
        await Promise.all([
            loadLocalDirectory('~'),
            loadRemoteDirectory('~'),
        ]);
    } catch (err) {
        console.error('Failed to open SFTP session:', err);
        state.rightPanel.error = String(err);
        render();
    }

    // Setup event listeners dla transferów
    setupTransferListeners();

    // Emituj event - nowy tab
    emitEvent('opened', { tabId });
}

/**
 * Aktywuj file manager (pokaż go, ukryj terminale)
 */
export function activateFileManager(): void {
    if (!container || !state.visible) return;

    // Ukryj wszystkie kontenery terminali
    const terminalContainers = document.querySelectorAll('#terminal-container > .terminal-pane');
    terminalContainers.forEach(tc => tc.classList.remove('active'));

    // Pokaż kontener file managera
    container.classList.add('active');

    emitEvent('activated', { tabId: getFileManagerTabId(state.sshSessionId!) });
}

/**
 * Deaktywuj file manager (ukryj, ale nie zamykaj)
 */
export function deactivateFileManager(): void {
    if (!container) return;
    container.classList.remove('active');
}

/**
 * Zamyka file manager (zamyka tab)
 */
export async function hideFileManager(): Promise<void> {
    if (!state.visible) return;

    const tabId = state.sshSessionId ? getFileManagerTabId(state.sshSessionId) : null;

    state.visible = false;
    if (container) {
        container.classList.remove('active');
        container.innerHTML = ''; // Clear content
    }

    // Cleanup listeners
    for (const unlisten of unlisteners) {
        unlisten();
    }
    unlisteners = [];

    // Zamknij SFTP session
    if (state.sftpSessionId) {
        try {
            await invoke('sftp_close', { sftpSessionId: state.sftpSessionId });
        } catch (err) {
            console.error('Failed to close SFTP session:', err);
        }
        state.sftpSessionId = null;
    }

    // Emituj event
    if (tabId) {
        emitEvent('closed', { tabId });
    }

    state.sshSessionId = null;
}

/**
 * Pobierz aktualnie skojarzoną sesję SSH
 */
export function getFileManagerSshSessionId(): string | null {
    return state.sshSessionId;
}

/**
 * Toggle file manager
 */
export function toggleFileManager(sshSessionId: string): void {
    if (state.visible) {
        hideFileManager();
    } else {
        showFileManager(sshSessionId);
    }
}

/**
 * Czy file manager jest widoczny
 */
export function isFileManagerVisible(): boolean {
    return state.visible;
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadLocalDirectory(path: string): Promise<void> {
    state.leftPanel.loading = true;
    state.leftPanel.error = null;
    render();

    try {
        const listing = await invoke<DirectoryListing>('local_list_dir', { path });
        state.leftPanel.path = listing.path;
        state.leftPanel.entries = sortEntries(
            listing.entries,
            state.leftPanel.sortField,
            state.leftPanel.sortOrder
        );
        state.leftPanel.selectedIndices = new Set();
        state.leftPanel.focusedIndex = 0;
    } catch (err) {
        state.leftPanel.error = String(err);
    } finally {
        state.leftPanel.loading = false;
        render();
    }
}

async function loadRemoteDirectory(path: string): Promise<void> {
    if (!state.sftpSessionId) return;

    state.rightPanel.loading = true;
    state.rightPanel.error = null;
    render();

    try {
        const listing = await invoke<DirectoryListing>('sftp_list_dir', {
            sftpSessionId: state.sftpSessionId,
            path,
        });
        state.rightPanel.path = listing.path;
        state.rightPanel.entries = sortEntries(
            listing.entries,
            state.rightPanel.sortField,
            state.rightPanel.sortOrder
        );
        state.rightPanel.selectedIndices = new Set();
        state.rightPanel.focusedIndex = 0;
    } catch (err) {
        state.rightPanel.error = String(err);
    } finally {
        state.rightPanel.loading = false;
        render();
    }
}

/**
 * Refresh panel preserving focus index (for after operations like copy/move/delete)
 */
async function refreshPanel(panel: 'left' | 'right', focusFileName?: string): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

    // Zachowaj nazwę aktualnie sfokusowanego pliku (lub użyj przekazanej)
    const prevFocusedName = focusFileName ?? panelState.entries[panelState.focusedIndex]?.name;
    const prevFocusedIndex = panelState.focusedIndex;
    const prevScrollTop = getScrollTop(panel);

    try {
        if (panel === 'left') {
            const listing = await invoke<DirectoryListing>('local_list_dir', { path: panelState.path });
            state.leftPanel.entries = sortEntries(listing.entries, state.leftPanel.sortField, state.leftPanel.sortOrder);
        } else {
            if (!state.sftpSessionId) return;
            const listing = await invoke<DirectoryListing>('sftp_list_dir', {
                sftpSessionId: state.sftpSessionId,
                path: panelState.path,
            });
            state.rightPanel.entries = sortEntries(listing.entries, state.rightPanel.sortField, state.rightPanel.sortOrder);
        }

        // Znajdź plik o tej samej nazwie
        const newIndex = panelState.entries.findIndex(e => e.name === prevFocusedName);
        if (newIndex >= 0) {
            panelState.focusedIndex = newIndex;
        } else {
            // Plik usunięty - zostań na tym samym indexie (lub ostatnim)
            panelState.focusedIndex = Math.min(prevFocusedIndex, panelState.entries.length - 1);
            panelState.focusedIndex = Math.max(0, panelState.focusedIndex);
        }

        panelState.selectedIndices.clear();
    } catch (err) {
        panelState.error = String(err);
    }

    // Aktualizuj tylko zawartość panelu (bez pełnego re-render)
    updatePanelFileList(panel);

    // Przywróć scroll po update
    requestAnimationFrame(() => restoreScrollTop(panel, prevScrollTop));
}

// ============================================================================
// File Operations
// ============================================================================

async function navigateToDirectory(panel: 'left' | 'right', path: string): Promise<void> {
    if (panel === 'left') {
        await loadLocalDirectory(path);
    } else {
        await loadRemoteDirectory(path);
    }
}

async function navigateUp(panel: 'left' | 'right'): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const parentPath = getParentPath(panelState.path);
    if (parentPath !== panelState.path) {
        await navigateToDirectory(panel, parentPath);
    }
}

function getParentPath(path: string): string {
    if (path === '/' || path === '') return '/';
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
}

async function openSelected(panel: 'left' | 'right'): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const entry = panelState.entries[panelState.focusedIndex];

    if (!entry) return;

    // Enter działa TYLKO na katalogach - jak w MC
    if (entry.isDir) {
        await navigateToDirectory(panel, entry.path);
    }
    // Dla plików - brak reakcji na Enter (użyj F5 do kopiowania)
}

// ============================================================================
// Conflict Resolution
// ============================================================================

type ConflictAction = 'overwrite' | 'skip' | 'overwriteAll' | 'skipAll' | 'cancel';

interface ConflictState {
    overwriteAll: boolean;
    skipAll: boolean;
    cancelled: boolean;
}

/**
 * Sprawdź czy plik/katalog istnieje w docelowym panelu
 */
function checkConflict(fileName: string, targetPanel: PanelState): boolean {
    return targetPanel.entries.some(e => e.name === fileName);
}

/**
 * Pokaż dialog rozwiązywania konfliktu
 */
function showConflictDialog(fileName: string, isDir: boolean): Promise<ConflictAction> {
    return new Promise((resolve) => {
        const typeLabel = isDir
            ? (t('fileManager.directory') || 'Directory')
            : (t('fileManager.file') || 'File');

        const content = `
            <div class="fm-conflict-dialog">
                <p class="fm-conflict-message">
                    ${typeLabel} <strong>"${escapeHtml(fileName)}"</strong> ${t('fileManager.alreadyExists') || 'already exists in destination'}.
                </p>
                <p class="fm-conflict-question">
                    ${t('fileManager.conflictQuestion') || 'What do you want to do?'}
                </p>
                <div class="fm-conflict-actions">
                    <button class="${buttonSecondaryClasses}" data-action="skip">${t('fileManager.skip') || 'Skip'}</button>
                    <button class="${buttonSecondaryClasses}" data-action="skipAll">${t('fileManager.skipAll') || 'Skip All'}</button>
                    <button class="${buttonPrimaryClasses}" data-action="overwrite">${t('fileManager.overwrite') || 'Overwrite'}</button>
                    <button class="${buttonDangerClasses}" data-action="overwriteAll">${t('fileManager.overwriteAll') || 'Overwrite All'}</button>
                    <button class="${buttonSecondaryClasses}" data-action="cancel">${t('common.cancel') || 'Cancel'}</button>
                </div>
            </div>
        `;

        const { element, close } = showDialog({
            title: t('fileManager.conflict') || 'File Conflict',
            content,
        });

        let resolved = false;
        const handleAction = (action: ConflictAction) => {
            if (resolved) return;
            resolved = true;
            document.removeEventListener('keydown', handleKeydown);
            close();
            resolve(action);
        };

        element.querySelector('[data-action="skip"]')?.addEventListener('click', () => handleAction('skip'));
        element.querySelector('[data-action="skipAll"]')?.addEventListener('click', () => handleAction('skipAll'));
        element.querySelector('[data-action="overwrite"]')?.addEventListener('click', () => handleAction('overwrite'));
        element.querySelector('[data-action="overwriteAll"]')?.addEventListener('click', () => handleAction('overwriteAll'));
        element.querySelector('[data-action="cancel"]')?.addEventListener('click', () => handleAction('cancel'));

        // ESC = cancel (tylko dla tego dialogu)
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleAction('cancel');
            }
        };
        document.addEventListener('keydown', handleKeydown);
    });
}

/**
 * Sprawdź konflikt i zapytaj użytkownika (z uwzględnieniem overwriteAll/skipAll)
 * Zwraca true jeśli można kontynuować transfer, false jeśli pominąć
 */
async function resolveConflict(
    fileName: string,
    isDir: boolean,
    targetPanel: PanelState,
    conflictState: ConflictState
): Promise<boolean> {
    // Jeśli anulowano całą operację
    if (conflictState.cancelled) {
        return false;
    }

    // Sprawdź czy jest konflikt
    if (!checkConflict(fileName, targetPanel)) {
        return true; // Brak konfliktu, kontynuuj
    }

    // Jeśli już wybrano "Pomiń wszystkie"
    if (conflictState.skipAll) {
        return false;
    }

    // Jeśli już wybrano "Nadpisz wszystkie"
    if (conflictState.overwriteAll) {
        return true;
    }

    // Pokaż dialog
    const action = await showConflictDialog(fileName, isDir);

    switch (action) {
        case 'overwrite':
            return true;
        case 'skip':
            return false;
        case 'overwriteAll':
            conflictState.overwriteAll = true;
            return true;
        case 'skipAll':
            conflictState.skipAll = true;
            return false;
        case 'cancel':
            conflictState.cancelled = true;
            return false;
    }
}

async function transferSelected(fromPanel: 'left' | 'right'): Promise<void> {
    const sourcePanel = fromPanel === 'left' ? state.leftPanel : state.rightPanel;
    const targetPanel = fromPanel === 'left' ? state.rightPanel : state.leftPanel;

    // Zbierz zaznaczone pliki
    const selectedEntries: FileEntry[] = [];
    if (sourcePanel.selectedIndices.size > 0) {
        for (const idx of sourcePanel.selectedIndices) {
            selectedEntries.push(sourcePanel.entries[idx]);
        }
    } else {
        // Jeśli nic nie zaznaczone, użyj focused
        const entry = sourcePanel.entries[sourcePanel.focusedIndex];
        if (entry) selectedEntries.push(entry);
    }

    // Stan konfliktów dla całej operacji
    const conflictState: ConflictState = {
        overwriteAll: false,
        skipAll: false,
        cancelled: false,
    };

    // Transferuj każdy plik/katalog
    for (const entry of selectedEntries) {
        // Sprawdź konflikt
        const shouldTransfer = await resolveConflict(entry.name, entry.isDir, targetPanel, conflictState);
        if (!shouldTransfer) {
            if (conflictState.cancelled) {
                break; // Użytkownik anulował całą operację
            }
            continue; // Pomiń ten plik
        }

        const transferId = crypto.randomUUID();
        const fileName = entry.name;
        const sourcePath = entry.path;
        const destPath = `${targetPanel.path}/${fileName}`;

        // Dodaj do kolejki
        const transfer: QueuedTransfer = {
            id: transferId,
            fileName,
            source: sourcePath,
            destination: destPath,
            direction: fromPanel === 'left' ? 'Upload' : 'Download',
            totalBytes: entry.size,
            transferredBytes: 0,
            status: 'Pending',
            error: null,
        };
        state.transfers.push(transfer);
        updateStatusBar();

        // Setup listeners for this transfer
        await listenToTransfer(transferId);

        // Rozpocznij transfer
        try {
            if (fromPanel === 'left') {
                // Upload: local -> remote
                await invoke('sftp_upload', {
                    sftpSessionId: state.sftpSessionId,
                    localPath: sourcePath,
                    remotePath: destPath,
                    transferId,
                });
            } else {
                // Download: remote -> local
                await invoke('sftp_download', {
                    sftpSessionId: state.sftpSessionId,
                    remotePath: sourcePath,
                    localPath: destPath,
                    transferId,
                });
            }
        } catch (err) {
            updateTransferStatus(transferId, 'Failed', String(err));
        }
    }
}

/**
 * Move files to other panel (Copy + Delete source)
 */
async function moveSelected(fromPanel: 'left' | 'right'): Promise<void> {
    const sourcePanel = fromPanel === 'left' ? state.leftPanel : state.rightPanel;
    const targetPanel = fromPanel === 'left' ? state.rightPanel : state.leftPanel;

    // Zbierz zaznaczone pliki
    const selectedEntries: FileEntry[] = [];
    if (sourcePanel.selectedIndices.size > 0) {
        for (const idx of sourcePanel.selectedIndices) {
            selectedEntries.push(sourcePanel.entries[idx]);
        }
    } else {
        const entry = sourcePanel.entries[sourcePanel.focusedIndex];
        if (entry) selectedEntries.push(entry);
    }

    // Stan konfliktów dla całej operacji
    const conflictState: ConflictState = {
        overwriteAll: false,
        skipAll: false,
        cancelled: false,
    };

    // Przenieś każdy plik/katalog
    for (const entry of selectedEntries) {
        // Sprawdź konflikt
        const shouldTransfer = await resolveConflict(entry.name, entry.isDir, targetPanel, conflictState);
        if (!shouldTransfer) {
            if (conflictState.cancelled) {
                break; // Użytkownik anulował całą operację
            }
            continue; // Pomiń ten plik
        }

        const transferId = crypto.randomUUID();
        const fileName = entry.name;
        const sourcePath = entry.path;
        const destPath = `${targetPanel.path}/${fileName}`;

        // Dodaj do kolejki
        const transfer: QueuedTransfer = {
            id: transferId,
            fileName,
            source: sourcePath,
            destination: destPath,
            direction: fromPanel === 'left' ? 'Upload' : 'Download',
            totalBytes: entry.size,
            transferredBytes: 0,
            status: 'Pending',
            error: null,
        };
        state.transfers.push(transfer);
        updateStatusBar();

        // Setup move listener (with delete on success)
        await listenToMove(transferId, fromPanel, sourcePath);

        // Rozpocznij transfer
        try {
            if (fromPanel === 'left') {
                await invoke('sftp_upload', {
                    sftpSessionId: state.sftpSessionId,
                    localPath: sourcePath,
                    remotePath: destPath,
                    transferId,
                });
            } else {
                await invoke('sftp_download', {
                    sftpSessionId: state.sftpSessionId,
                    remotePath: sourcePath,
                    localPath: destPath,
                    transferId,
                });
            }
        } catch (err) {
            updateTransferStatus(transferId, 'Failed', String(err));
        }
    }
}

function updateTransferStatus(transferId: string, status: QueuedTransfer['status'], error?: string): void {
    const transfer = state.transfers.find(t => t.id === transferId);
    if (transfer) {
        transfer.status = status;
        if (error) transfer.error = error;
        updateStatusBar();
    }
}

function updateTransferProgress(progress: TransferProgress): void {
    const transfer = state.transfers.find(t => t.id === progress.id);
    if (transfer) {
        transfer.transferredBytes = progress.transferredBytes;
        transfer.totalBytes = progress.totalBytes;
        transfer.status = progress.status;
        transfer.error = progress.error;
        updateStatusBar();
    }
}

/**
 * Update only the status bar (transfer progress) without full re-render
 */
function updateStatusBar(): void {
    if (!container) return;
    const footer = container.querySelector('.fm-footer');
    if (!footer) return;

    // Get first child (status bar area) - preserve hint
    const statusHtml = renderStatusBar();
    const hintEl = footer.querySelector('.fm-hint');
    const hintHtml = hintEl ? hintEl.outerHTML : '';

    footer.innerHTML = statusHtml + hintHtml;
}

// ============================================================================
// Toast Notifications
// ============================================================================

let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'fm-toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

function showToast(type: 'success' | 'error', title: string, message: string, duration = 3000): void {
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `fm-toast fm-toast-${type}`;

    const icon = type === 'success' ? '✓' : '✕';

    toast.innerHTML = `
        <span class="fm-toast-icon">${icon}</span>
        <div class="fm-toast-content">
            <div class="fm-toast-title">${escapeHtml(title)}</div>
            <div class="fm-toast-message" title="${escapeHtml(message)}">${escapeHtml(message)}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto-remove po duration
    setTimeout(() => {
        toast.classList.add('fm-toast-out');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

// ============================================================================
// File Operations Dialogs
// ============================================================================

async function showMkdirDialog(panel: 'left' | 'right'): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

    const content = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div>
                <label class="${labelClasses}">${t('fileManager.mkdirName') || 'Directory name'}</label>
                <input type="text" id="mkdir-name" class="${inputClasses}"
                       placeholder="${t('fileManager.mkdirName') || 'New folder'}"
                       autofocus />
            </div>
        </div>
    `;

    const { element, close } = showDialog({
        title: t('fileManager.mkdir') || 'Create Directory',
        content,
        footer: `
            <button class="${buttonSecondaryClasses}" data-action="cancel">${t('common.cancel') || 'Cancel'}</button>
            <button class="${buttonPrimaryClasses}" data-action="create">${t('common.create') || 'Create'}</button>
        `,
    });

    const nameInput = element.querySelector('#mkdir-name') as HTMLInputElement;
    nameInput?.focus();

    // Handle Enter key
    nameInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await createDirectory();
        }
    });

    async function createDirectory() {
        const name = nameInput?.value.trim();
        if (!name) return;

        const newPath = `${panelState.path}/${name}`;

        try {
            if (panel === 'left') {
                await invoke('local_mkdir', { path: newPath });
            } else {
                await invoke('sftp_mkdir', { sftpSessionId: state.sftpSessionId, path: newPath });
            }
            // Odśwież panel i fokusuj nowy katalog
            await refreshPanel(panel, name);
            showToast('success', t('fileManager.mkdir') || 'Created', name);
            close();
        } catch (err) {
            console.error('Failed to create directory:', err);
            showToast('error', t('fileManager.failed') || 'Failed', name);
        }
    }

    element.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
    element.querySelector('[data-action="create"]')?.addEventListener('click', createDirectory);
}

async function showDeleteDialog(panel: 'left' | 'right'): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

    // Zbierz zaznaczone pliki
    const selectedEntries: FileEntry[] = [];
    if (panelState.selectedIndices.size > 0) {
        for (const idx of panelState.selectedIndices) {
            selectedEntries.push(panelState.entries[idx]);
        }
    } else {
        const entry = panelState.entries[panelState.focusedIndex];
        if (entry) selectedEntries.push(entry);
    }

    if (selectedEntries.length === 0) return;

    const fileList = selectedEntries.map(e => `• ${e.name}`).join('\n');
    const confirmed = await showConfirm({
        title: t('fileManager.delete') || 'Delete',
        message: `${t('fileManager.deleteConfirm') || 'Delete selected files?'}\n\n${fileList}`,
        confirmText: t('common.delete') || 'Delete',
        cancelText: t('common.cancel') || 'Cancel',
        danger: true,
    });

    if (!confirmed) return;

    // Usuń każdy plik
    let deletedCount = 0;
    let failedCount = 0;
    for (const entry of selectedEntries) {
        try {
            if (panel === 'left') {
                await invoke('local_remove', { path: entry.path, recursive: entry.isDir });
            } else {
                await invoke('sftp_remove', {
                    sftpSessionId: state.sftpSessionId,
                    path: entry.path,
                    recursive: entry.isDir
                });
            }
            deletedCount++;
        } catch (err) {
            console.error('Failed to delete:', entry.path, err);
            failedCount++;
        }
    }

    // Show toast summary
    if (deletedCount > 0) {
        const msg = deletedCount === 1 ? selectedEntries[0].name : `${deletedCount} ${t('fileManager.items') || 'items'}`;
        showToast('success', t('fileManager.delete') || 'Deleted', msg);
    }
    if (failedCount > 0) {
        showToast('error', t('fileManager.failed') || 'Failed', `${failedCount} ${t('fileManager.items') || 'items'}`);
    }

    // Odśwież panel (refreshPanel zachowa pozycję fokusa)
    await refreshPanel(panel);
}

async function showRenameDialog(panel: 'left' | 'right'): Promise<void> {
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const entry = panelState.entries[panelState.focusedIndex];
    if (!entry) return;

    const content = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div>
                <label class="${labelClasses}">${t('fileManager.newName') || 'New name'}</label>
                <input type="text" id="rename-name" class="${inputClasses}"
                       value="${entry.name}" autofocus />
            </div>
        </div>
    `;

    const { element, close } = showDialog({
        title: t('fileManager.rename') || 'Rename',
        content,
        footer: `
            <button class="${buttonSecondaryClasses}" data-action="cancel">${t('common.cancel') || 'Cancel'}</button>
            <button class="${buttonPrimaryClasses}" data-action="rename">${t('fileManager.rename') || 'Rename'}</button>
        `,
    });

    const nameInput = element.querySelector('#rename-name') as HTMLInputElement;
    nameInput?.focus();
    nameInput?.select();

    // Handle Enter key
    nameInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await doRename();
        }
    });

    async function doRename() {
        const newName = nameInput?.value.trim();
        if (!newName || newName === entry.name) {
            close();
            return;
        }

        const parentPath = entry.path.substring(0, entry.path.lastIndexOf('/'));
        const newPath = `${parentPath}/${newName}`;

        try {
            if (panel === 'left') {
                await invoke('local_rename', { oldPath: entry.path, newPath });
            } else {
                await invoke('sftp_rename', {
                    sftpSessionId: state.sftpSessionId,
                    oldPath: entry.path,
                    newPath
                });
            }
            // Odśwież panel i fokusuj przemianowany plik
            await refreshPanel(panel, newName);
            showToast('success', t('fileManager.rename') || 'Renamed', `${entry.name} → ${newName}`);
            close();
        } catch (err) {
            console.error('Failed to rename:', err);
            showToast('error', t('fileManager.failed') || 'Failed', entry.name);
        }
    }

    element.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
    element.querySelector('[data-action="rename"]')?.addEventListener('click', doRename);
}

// ============================================================================
// Event Listeners
// ============================================================================

async function setupTransferListeners(): Promise<void> {
    // Cleanup existing listeners
    for (const unlisten of unlisteners) {
        unlisten();
    }
    unlisteners = [];
}

async function listenToTransfer(transferId: string): Promise<void> {
    // Progress listener
    const unlistenProgress = await listen<TransferProgress>(`transfer-progress-${transferId}`, (event) => {
        updateTransferProgress(event.payload);
    });
    unlisteners.push(unlistenProgress);

    // Complete listener
    const unlistenComplete = await listen<TransferProgress>(`transfer-complete-${transferId}`, async (event) => {
        updateTransferProgress(event.payload);

        // Show toast notification
        const transfer = state.transfers.find(tr => tr.id === transferId);
        const fileName = transfer?.fileName || event.payload.source.split('/').pop() || 'File';
        showToast('success', t('fileManager.completed') || 'Completed', fileName);

        // Refresh both panels preserving position
        await Promise.all([
            refreshPanel('left'),
            refreshPanel('right'),
        ]);
    });
    unlisteners.push(unlistenComplete);

    // Error listener
    const unlistenError = await listen<TransferProgress>(`transfer-error-${transferId}`, (event) => {
        updateTransferProgress(event.payload);

        // Show error toast
        const transfer = state.transfers.find(tr => tr.id === transferId);
        const fileName = transfer?.fileName || event.payload.source.split('/').pop() || 'File';
        showToast('error', t('fileManager.failed') || 'Failed', fileName);
    });
    unlisteners.push(unlistenError);
}

/**
 * Listen to move operation - delete source after successful transfer
 */
async function listenToMove(transferId: string, fromPanel: 'left' | 'right', sourcePath: string): Promise<void> {
    // Progress listener
    const unlistenProgress = await listen<TransferProgress>(`transfer-progress-${transferId}`, (event) => {
        updateTransferProgress(event.payload);
    });
    unlisteners.push(unlistenProgress);

    // Complete listener - delete source after successful transfer
    const unlistenComplete = await listen<TransferProgress>(`transfer-complete-${transferId}`, async (event) => {
        updateTransferProgress(event.payload);

        // Delete source file after successful transfer
        try {
            if (fromPanel === 'left') {
                await invoke('local_remove', { path: sourcePath, recursive: false });
            } else {
                await invoke('sftp_remove', {
                    sftpSessionId: state.sftpSessionId,
                    path: sourcePath,
                    recursive: false
                });
            }
        } catch (err) {
            console.error('Failed to delete source after move:', err);
        }

        // Show toast notification for move
        const transfer = state.transfers.find(tr => tr.id === transferId);
        const fileName = transfer?.fileName || event.payload.source.split('/').pop() || 'File';
        showToast('success', t('fileManager.move') || 'Moved', fileName);

        // Refresh both panels preserving position
        await Promise.all([
            refreshPanel('left'),
            refreshPanel('right'),
        ]);
    });
    unlisteners.push(unlistenComplete);

    // Error listener
    const unlistenError = await listen<TransferProgress>(`transfer-error-${transferId}`, (event) => {
        updateTransferProgress(event.payload);

        // Show error toast
        const transfer = state.transfers.find(tr => tr.id === transferId);
        const fileName = transfer?.fileName || event.payload.source.split('/').pop() || 'File';
        showToast('error', t('fileManager.failed') || 'Failed', fileName);
    });
    unlisteners.push(unlistenError);
}

function handleGlobalKeydown(e: KeyboardEvent): void {
    // Sprawdź czy file manager jest widoczny I aktywny
    if (!state.visible || !container?.classList.contains('active')) return;

    // ESC nie zamyka file managera - to robi się przez zamknięcie karty

    // Tab przełącza panel (i czyści zaznaczenie w poprzednim)
    if (e.key === 'Tab') {
        e.preventDefault();
        switchActivePanel(state.activePanel === 'left' ? 'right' : 'left');
        return;
    }

    const panel = state.activePanel;
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            if (panelState.focusedIndex > 0) {
                panelState.focusedIndex--;
                if (!e.shiftKey) panelState.selectedIndices.clear();
                if (e.shiftKey) {
                    panelState.selectedIndices.add(panelState.focusedIndex);
                }
                updateRowSelection(panel);
                scrollToFocused(panel);
            }
            break;

        case 'ArrowDown':
            e.preventDefault();
            if (panelState.focusedIndex < panelState.entries.length - 1) {
                panelState.focusedIndex++;
                if (!e.shiftKey) panelState.selectedIndices.clear();
                if (e.shiftKey) {
                    panelState.selectedIndices.add(panelState.focusedIndex);
                }
                updateRowSelection(panel);
                scrollToFocused(panel);
            }
            break;

        case 'Enter':
            e.preventDefault();
            openSelected(panel);
            break;

        case 'Backspace':
            e.preventDefault();
            navigateUp(panel);
            break;

        case 'F5':
            e.preventDefault();
            transferSelected(panel);
            break;

        case 'F7':
            e.preventDefault();
            showMkdirDialog(panel);
            break;

        case 'F8':
        case 'Delete':
            e.preventDefault();
            showDeleteDialog(panel);
            break;

        case 'F6':
            e.preventDefault();
            moveSelected(panel);
            break;

        case 'F2':
            e.preventDefault();
            showRenameDialog(panel);
            break;

        case ' ':
            e.preventDefault();
            // Toggle selection
            if (panelState.selectedIndices.has(panelState.focusedIndex)) {
                panelState.selectedIndices.delete(panelState.focusedIndex);
            } else {
                panelState.selectedIndices.add(panelState.focusedIndex);
            }
            updateRowSelection(panel);
            break;

        case 'Insert':
            e.preventDefault();
            // Toggle selection and move down (NC style)
            if (panelState.selectedIndices.has(panelState.focusedIndex)) {
                panelState.selectedIndices.delete(panelState.focusedIndex);
            } else {
                panelState.selectedIndices.add(panelState.focusedIndex);
            }
            // Move focus down
            if (panelState.focusedIndex < panelState.entries.length - 1) {
                panelState.focusedIndex++;
            }
            updateRowSelection(panel);
            scrollToFocused(panel);
            break;

        case 'a':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                // Select all
                panelState.selectedIndices.clear();
                for (let i = 0; i < panelState.entries.length; i++) {
                    panelState.selectedIndices.add(i);
                }
                updateRowSelection(panel);
            }
            break;
    }
}

// ============================================================================
// Rendering
// ============================================================================

function render(): void {
    if (!container) return;

    container.innerHTML = `
        <div class="fm-container">
            <div class="fm-header">
                <h2 class="fm-title">${t('fileManager.title') || 'File Manager'}</h2>
                <button class="fm-close-btn" data-action="close">&times;</button>
            </div>
            <div class="fm-panels">
                ${renderPanel('left', state.leftPanel)}
                ${renderPanel('right', state.rightPanel)}
            </div>
            <div class="fm-footer">
                ${renderStatusBar()}
                <span class="fm-hint">${t('fileManager.hint') || 'Tab: Switch | Enter: Open | F5: Copy | F6: Move | F7: Mkdir | F8: Del | F2: Rename | Esc: Terminal'}</span>
            </div>
        </div>
    `;

    // Event handlers
    setupEventHandlers();
}

function renderPanel(side: 'left' | 'right', panel: PanelState): string {
    const isActive = state.activePanel === side;
    const typeLabel = panel.type === 'local'
        ? (t('fileManager.local') || 'Local')
        : (t('fileManager.remote') || 'Remote');

    return `
        <div class="fm-panel ${isActive ? 'fm-panel-active' : ''}" data-panel="${side}">
            <div class="fm-panel-header">
                <span class="fm-panel-type">${typeLabel}</span>
                <div class="fm-breadcrumb" data-panel="${side}">
                    ${renderBreadcrumb(panel.path, side)}
                </div>
            </div>
            <div class="fm-panel-content">
                ${panel.loading ? renderLoading() : ''}
                ${panel.error ? renderError(panel.error) : ''}
                ${!panel.loading && !panel.error ? renderFileList(panel, side) : ''}
            </div>
            <div class="fm-panel-footer">
                ${panel.selectedIndices.size > 0
                    ? (t('fileManager.selected') || '{count} selected').replace('{count}', String(panel.selectedIndices.size))
                    : (t('fileManager.items') || '{count} items').replace('{count}', String(panel.entries.length))}
            </div>
        </div>
    `;
}

function renderBreadcrumb(path: string, panel: 'left' | 'right'): string {
    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    const items = parts.map((part, i) => {
        currentPath += '/' + part;
        const isLast = i === parts.length - 1;
        return `<span class="fm-breadcrumb-item ${isLast ? 'fm-breadcrumb-current' : ''}"
                      data-path="${currentPath}" data-panel="${panel}">${part}</span>`;
    });

    return `<span class="fm-breadcrumb-item" data-path="/" data-panel="${panel}">/</span>` + items.join('<span class="fm-breadcrumb-sep">/</span>');
}

function renderFileList(panel: PanelState, side: 'left' | 'right'): string {
    if (panel.entries.length === 0) {
        return `<div class="fm-empty">${t('fileManager.emptyDir') || 'Empty directory'}</div>`;
    }

    const rows = panel.entries.map((entry, idx) => {
        const isSelected = panel.selectedIndices.has(idx);
        const isFocused = panel.focusedIndex === idx;
        const icon = getFileIcon(entry);

        return `
            <div class="fm-list-row ${isSelected ? 'fm-list-row-selected' : ''} ${isFocused ? 'fm-list-row-focused' : ''}"
                 data-index="${idx}" data-panel="${side}" data-path="${entry.path}">
                <div class="fm-list-cell fm-cell-check">
                    <span class="fm-checkbox ${isSelected ? 'fm-checkbox-checked' : ''}">${isSelected ? '✓' : ''}</span>
                </div>
                <div class="fm-list-cell fm-cell-icon">
                    <svg viewBox="0 0 24 24" class="fm-file-icon ${entry.isDir ? 'fm-icon-dir' : 'fm-icon-file'}">
                        <path d="${icon}"/>
                    </svg>
                </div>
                <div class="fm-list-cell fm-cell-name" title="${entry.name}">${entry.name}</div>
                <div class="fm-list-cell fm-cell-size">${entry.isDir ? '-' : formatFileSize(entry.size)}</div>
                <div class="fm-list-cell fm-cell-date">${formatDate(entry.modified)}</div>
            </div>
        `;
    });

    return `
        <div class="fm-list-header">
            <div class="fm-list-cell fm-cell-check"></div>
            <div class="fm-list-cell fm-cell-icon"></div>
            <div class="fm-list-cell fm-cell-name">${t('fileManager.name') || 'Name'}</div>
            <div class="fm-list-cell fm-cell-size">${t('fileManager.size') || 'Size'}</div>
            <div class="fm-list-cell fm-cell-date">${t('fileManager.modified') || 'Modified'}</div>
        </div>
        <div class="fm-list-body">
            ${rows.join('')}
        </div>
    `;
}

function getTransferStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
        'Pending': t('fileManager.pending') || 'Pending',
        'InProgress': t('fileManager.inProgress') || 'Transferring',
        'Completed': t('fileManager.completed') || 'Completed',
        'Failed': t('fileManager.failed') || 'Failed',
        'Cancelled': t('fileManager.cancelled') || 'Cancelled',
    };
    return statusMap[status] || status;
}

/**
 * Render single status bar showing current transfer (if any)
 */
function renderStatusBar(): string {
    // Znajdź aktywny transfer (InProgress lub Pending)
    const activeTransfer = state.transfers.find(t =>
        t.status === 'InProgress' || t.status === 'Pending'
    );

    if (!activeTransfer) {
        // Usuń zakończone transfery
        state.transfers = state.transfers.filter(t =>
            t.status === 'InProgress' || t.status === 'Pending'
        );
        return '';
    }

    const percent = activeTransfer.totalBytes > 0
        ? Math.round((activeTransfer.transferredBytes / activeTransfer.totalBytes) * 100)
        : 0;

    const directionIcon = activeTransfer.direction === 'Upload' ? '↑' : '↓';
    const statusText = activeTransfer.status === 'Pending'
        ? (t('fileManager.pending') || 'Pending')
        : `${percent}%`;

    return `
        <div class="fm-status-bar">
            <span class="fm-status-icon">${directionIcon}</span>
            <span class="fm-status-name">${activeTransfer.fileName}</span>
            <div class="fm-status-progress">
                <div class="fm-status-progress-bar" style="width: ${percent}%"></div>
            </div>
            <span class="fm-status-percent">${statusText}</span>
        </div>
    `;
}

function renderLoading(): string {
    return `<div class="fm-loading">${t('fileManager.loading') || 'Loading...'}</div>`;
}

function renderError(error: string): string {
    return `<div class="fm-error">${error}</div>`;
}

function setupEventHandlers(): void {
    if (!container) return;

    // Close button
    container.querySelector('[data-action="close"]')?.addEventListener('click', () => {
        hideFileManager();
    });

    // Panel click to activate (czyści zaznaczenie w poprzednim)
    container.querySelectorAll('.fm-panel').forEach(panel => {
        panel.addEventListener('click', () => {
            const side = panel.getAttribute('data-panel') as 'left' | 'right';
            if (side) {
                switchActivePanel(side);
            }
        });
    });

    // Breadcrumb navigation
    container.querySelectorAll('.fm-breadcrumb-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = item.getAttribute('data-path');
            const panel = item.getAttribute('data-panel') as 'left' | 'right';
            if (path && panel) {
                navigateToDirectory(panel, path);
            }
        });
    });

    // File list row click
    container.querySelectorAll('.fm-list-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(row.getAttribute('data-index') || '0');
            const panel = row.getAttribute('data-panel') as 'left' | 'right';
            const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

            state.activePanel = panel;
            panelState.focusedIndex = idx;

            if ((e as MouseEvent).shiftKey) {
                panelState.selectedIndices.add(idx);
            } else if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
                if (panelState.selectedIndices.has(idx)) {
                    panelState.selectedIndices.delete(idx);
                } else {
                    panelState.selectedIndices.add(idx);
                }
            } else {
                panelState.selectedIndices.clear();
            }

            // Update visuals without full re-render
            updateRowSelection(panel);
            updatePanelActive();
        });

        // Double click to open
        row.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const panel = row.getAttribute('data-panel') as 'left' | 'right';
            openSelected(panel);
        });
    });

    // Checkbox click handler
    container.querySelectorAll('.fm-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = (e.target as HTMLElement).closest('.fm-list-row');
            if (!row) return;
            const idx = parseInt(row.getAttribute('data-index') || '0');
            const panel = row.getAttribute('data-panel') as 'left' | 'right';
            const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

            state.activePanel = panel;

            if (panelState.selectedIndices.has(idx)) {
                panelState.selectedIndices.delete(idx);
            } else {
                panelState.selectedIndices.add(idx);
            }
            updateRowSelection(panel);
        });
    });
}

/**
 * Setup event handlers for a single panel (after partial update)
 */
function setupPanelEventHandlers(panel: 'left' | 'right'): void {
    if (!container) return;
    const panelEl = container.querySelector(`[data-panel="${panel}"]`);
    if (!panelEl) return;

    // Breadcrumb navigation for this panel
    panelEl.querySelectorAll('.fm-breadcrumb-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = item.getAttribute('data-path');
            if (path) {
                navigateToDirectory(panel, path);
            }
        });
    });

    // File list row click
    panelEl.querySelectorAll('.fm-list-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(row.getAttribute('data-index') || '0');
            const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

            state.activePanel = panel;
            panelState.focusedIndex = idx;

            if ((e as MouseEvent).shiftKey) {
                panelState.selectedIndices.add(idx);
            } else if ((e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
                if (panelState.selectedIndices.has(idx)) {
                    panelState.selectedIndices.delete(idx);
                } else {
                    panelState.selectedIndices.add(idx);
                }
            } else {
                panelState.selectedIndices.clear();
            }

            updateRowSelection(panel);
            updatePanelActive();
        });

        // Double click to open
        row.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openSelected(panel);
        });
    });

    // Checkbox click handler
    panelEl.querySelectorAll('.fm-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = (e.target as HTMLElement).closest('.fm-list-row');
            if (!row) return;
            const idx = parseInt(row.getAttribute('data-index') || '0');
            const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;

            state.activePanel = panel;

            if (panelState.selectedIndices.has(idx)) {
                panelState.selectedIndices.delete(idx);
            } else {
                panelState.selectedIndices.add(idx);
            }
            updateRowSelection(panel);
        });
    });
}

/**
 * Switch active panel and clear selection in previous panel
 */
function switchActivePanel(newPanel: 'left' | 'right'): void {
    if (state.activePanel === newPanel) return;

    // Wyczyść zaznaczenie w poprzednim panelu
    const prevPanelState = state.activePanel === 'left' ? state.leftPanel : state.rightPanel;
    prevPanelState.selectedIndices.clear();
    updateRowSelection(state.activePanel);

    // Przełącz na nowy panel
    state.activePanel = newPanel;
    updatePanelActive();
}

/**
 * Update row selection classes without full re-render
 */
function updateRowSelection(panel: 'left' | 'right'): void {
    if (!container) return;
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const panelEl = container.querySelector(`[data-panel="${panel}"]`);
    if (!panelEl) return;

    panelEl.querySelectorAll('.fm-list-row').forEach((row, idx) => {
        const isSelected = panelState.selectedIndices.has(idx);
        const isFocused = panelState.focusedIndex === idx;

        row.classList.toggle('fm-list-row-selected', isSelected);
        row.classList.toggle('fm-list-row-focused', isFocused);

        // Update checkbox
        const checkbox = row.querySelector('.fm-checkbox');
        if (checkbox) {
            checkbox.classList.toggle('fm-checkbox-checked', isSelected);
            checkbox.textContent = isSelected ? '✓' : '';
        }
    });

    // Update footer count
    const footer = panelEl.querySelector('.fm-panel-footer');
    if (footer) {
        footer.textContent = panelState.selectedIndices.size > 0
            ? (t('fileManager.selected') || '{count} selected').replace('{count}', String(panelState.selectedIndices.size))
            : (t('fileManager.items') || '{count} items').replace('{count}', String(panelState.entries.length));
    }
}

/**
 * Update only the file list content of a panel (without full re-render)
 * This prevents visual "jumping" when refreshing after operations
 */
function updatePanelFileList(panel: 'left' | 'right'): void {
    if (!container) return;
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const panelEl = container.querySelector(`[data-panel="${panel}"]`);
    if (!panelEl) return;

    const contentEl = panelEl.querySelector('.fm-panel-content');
    if (!contentEl) return;

    // Update file list
    contentEl.innerHTML = panelState.loading
        ? renderLoading()
        : panelState.error
            ? renderError(panelState.error)
            : renderFileList(panelState, panel);

    // Update breadcrumb
    const breadcrumbEl = panelEl.querySelector('.fm-breadcrumb');
    if (breadcrumbEl) {
        breadcrumbEl.innerHTML = renderBreadcrumb(panelState.path, panel);
    }

    // Update footer
    const footer = panelEl.querySelector('.fm-panel-footer');
    if (footer) {
        footer.textContent = panelState.selectedIndices.size > 0
            ? (t('fileManager.selected') || '{count} selected').replace('{count}', String(panelState.selectedIndices.size))
            : (t('fileManager.items') || '{count} items').replace('{count}', String(panelState.entries.length));
    }

    // Re-attach event handlers for this panel only
    setupPanelEventHandlers(panel);
}

/**
 * Update active panel visual state
 */
function updatePanelActive(): void {
    if (!container) return;

    container.querySelectorAll('.fm-panel').forEach(panel => {
        const side = panel.getAttribute('data-panel');
        panel.classList.toggle('fm-panel-active', side === state.activePanel);
    });
}

/**
 * Scroll to keep focused row visible
 */
function scrollToFocused(panel: 'left' | 'right'): void {
    if (!container) return;
    const panelState = panel === 'left' ? state.leftPanel : state.rightPanel;
    const panelEl = container.querySelector(`[data-panel="${panel}"]`);
    if (!panelEl) return;

    const listBody = panelEl.querySelector('.fm-list-body');
    const focusedRow = panelEl.querySelector(`.fm-list-row[data-index="${panelState.focusedIndex}"]`) as HTMLElement;

    if (listBody && focusedRow) {
        const listRect = listBody.getBoundingClientRect();
        const rowRect = focusedRow.getBoundingClientRect();

        // Scroll up if row is above visible area
        if (rowRect.top < listRect.top) {
            focusedRow.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
        // Scroll down if row is below visible area
        else if (rowRect.bottom > listRect.bottom) {
            focusedRow.scrollIntoView({ block: 'end', behavior: 'instant' });
        }
    }
}

/**
 * Get current scroll position of panel list
 */
function getScrollTop(panel: 'left' | 'right'): number {
    if (!container) return 0;
    const panelEl = container.querySelector(`[data-panel="${panel}"]`);
    const listBody = panelEl?.querySelector('.fm-list-body') as HTMLElement;
    return listBody?.scrollTop || 0;
}

/**
 * Restore scroll position after render
 */
function restoreScrollTop(panel: 'left' | 'right', scrollTop: number): void {
    if (!container) return;
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
        const panelEl = container?.querySelector(`[data-panel="${panel}"]`);
        const listBody = panelEl?.querySelector('.fm-list-body') as HTMLElement;
        if (listBody) {
            listBody.scrollTop = scrollTop;
        }
    }, 0);
}
