// file-manager-state.ts
// Interfejsy i typy dla file managera

/**
 * Wpis pliku/katalogu
 */
export interface FileEntry {
    name: string;
    path: string;
    isDir: boolean;
    isSymlink: boolean;
    size: number;
    modified: number | null; // Unix timestamp w sekundach
    permissions: number | null;
}

/**
 * Listing katalogu
 */
export interface DirectoryListing {
    path: string;
    entries: FileEntry[];
}

/**
 * Kierunek transferu
 */
export type TransferDirection = 'Upload' | 'Download';

/**
 * Status transferu
 */
export type TransferStatus = 'Pending' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled';

/**
 * Postęp transferu
 */
export interface TransferProgress {
    id: string;
    source: string;
    destination: string;
    direction: TransferDirection;
    totalBytes: number;
    transferredBytes: number;
    status: TransferStatus;
    error: string | null;
}

/**
 * Kolejkowany transfer
 */
export interface QueuedTransfer extends TransferProgress {
    fileName: string;
}

/**
 * Tryb sortowania
 */
export type SortField = 'name' | 'size' | 'modified';
export type SortOrder = 'asc' | 'desc';

/**
 * Stan panelu (local lub remote)
 */
export interface PanelState {
    type: 'local' | 'remote';
    path: string;
    entries: FileEntry[];
    loading: boolean;
    error: string | null;
    selectedIndices: Set<number>;
    focusedIndex: number;
    sortField: SortField;
    sortOrder: SortOrder;
}

/**
 * Stan całego file managera
 */
export interface FileManagerState {
    visible: boolean;
    sshSessionId: string | null;
    sftpSessionId: string | null;
    activePanel: 'left' | 'right';
    leftPanel: PanelState;
    rightPanel: PanelState;
    transfers: QueuedTransfer[];
}

/**
 * Tworzy początkowy stan panelu
 */
export function createInitialPanelState(type: 'local' | 'remote'): PanelState {
    return {
        type,
        path: '',
        entries: [],
        loading: false,
        error: null,
        selectedIndices: new Set(),
        focusedIndex: 0,
        sortField: 'name',
        sortOrder: 'asc',
    };
}

/**
 * Tworzy początkowy stan file managera
 */
export function createInitialState(): FileManagerState {
    return {
        visible: false,
        sshSessionId: null,
        sftpSessionId: null,
        activePanel: 'left',
        leftPanel: createInitialPanelState('local'),
        rightPanel: createInitialPanelState('remote'),
        transfers: [],
    };
}

/**
 * Formatuje rozmiar pliku do czytelnej postaci
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Formatuje datę modyfikacji
 */
export function formatDate(timestamp: number | null): string {
    if (timestamp === null) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Formatuje uprawnienia (Unix)
 */
export function formatPermissions(mode: number | null): string {
    if (mode === null) return '-';
    const perms = mode & 0o777;
    const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    const owner = chars[(perms >> 6) & 7];
    const group = chars[(perms >> 3) & 7];
    const other = chars[perms & 7];
    return `${owner}${group}${other}`;
}

/**
 * Sortuje wpisy według podanego pola
 */
export function sortEntries(
    entries: FileEntry[],
    field: SortField,
    order: SortOrder
): FileEntry[] {
    const sorted = [...entries].sort((a, b) => {
        // Katalogi zawsze na górze
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;

        let cmp = 0;
        switch (field) {
            case 'name':
                cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                break;
            case 'size':
                cmp = a.size - b.size;
                break;
            case 'modified':
                cmp = (a.modified || 0) - (b.modified || 0);
                break;
        }
        return order === 'asc' ? cmp : -cmp;
    });
    return sorted;
}

/**
 * Pobiera rozszerzenie pliku
 */
export function getFileExtension(name: string): string {
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return name.slice(lastDot + 1).toLowerCase();
}

/**
 * Zwraca ikonę dla pliku (SVG path)
 */
export function getFileIcon(entry: FileEntry): string {
    if (entry.isDir) {
        return 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z';
    }

    const ext = getFileExtension(entry.name);

    // Ikony dla popularnych rozszerzeń
    const iconMap: Record<string, string> = {
        // Dokumenty
        txt: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
        pdf: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
        // Kod
        js: 'M3 3h18v18H3V3zm16.525 13.707c-.131-.821-.666-1.511-2.252-2.155-.552-.259-1.165-.438-1.349-.854-.068-.248-.078-.382-.034-.529.113-.484.687-.629 1.137-.495.293.09.563.315.732.676.775-.507.775-.507 1.316-.844-.203-.314-.304-.451-.439-.586-.473-.528-1.103-.798-2.126-.775l-.528.067c-.507.124-.991.395-1.283.754-.855.968-.611 2.655.26 3.352.865.696 2.138 1.012 2.297 1.793.152.907-.669 1.197-1.512 1.091-.623-.085-1.018-.393-1.412-.879l-1.369.805c.158.321.336.465.604.749 1.292 1.226 4.514 1.163 5.091-1.14.021-.064.158-.521.059-1.211zM9 11.387h1.687c.003-1.3.005-2.597-.002-3.896-.089-.856-.802-1.09-1.29-.887-.42.178-.726.491-.726.895H7.064c.04-.852.493-1.5 1.138-1.876 1.01-.587 2.79-.444 3.558.403.444.489.66 1.093.656 1.842V15.5H9v-4.113z',
        ts: 'M3 3h18v18H3V3zm10.5 10.5V15H12v-1.5h1.5zM12 10.5V9h1.5v1.5H12zm2.5 2v.5h1V12h1v1h-1v.5h2V15h-3v-1.5h1.5V13h-1V12h1v-.5h-1.5zm-8 2V13h2V9h1.5v4h1.5v1.5H6.5z',
        py: 'M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.68H3.21l-.01-.66.06-.73.12-.74.18-.7.24-.66.31-.59.37-.52.43-.45.49-.38.55-.31.61-.24.66-.17.71-.1.77-.04h7.09V8.5l-.05-.63-.13-.55-.21-.46-.26-.38-.3-.31-.33-.25-.35-.19-.35-.14-.33-.1-.3-.07-.26-.04-.21-.02H8.08v-.01l-.01-.02v-.02l.01-.02.01-.01.01-.01.02-.01h.02l.02.01h.01l.01.01.01.02v.02l-.01.02v.01l-.01.01h-.01l-.02.01H8v.01h6.25V.18zM9.77 6.64H8.43v1.33h1.34V6.64z',
        rs: 'M23.687 11.707l-.002-.006a.468.468 0 00-.032-.078l-.006-.013a.443.443 0 00-.053-.078l-.004-.005a.44.44 0 00-.072-.066l-.01-.007a.422.422 0 00-.084-.05l-.012-.005-2.408-.955.848-2.395a.444.444 0 00-.584-.574l-2.395.848-.954-2.408a.444.444 0 00-.83 0l-.955 2.408-2.394-.848a.445.445 0 00-.575.584l.849 2.395-2.408.955a.445.445 0 000 .83l2.408.955-.849 2.394a.443.443 0 00.104.46.446.446 0 00.47.114l2.395-.848.955 2.408a.444.444 0 00.83 0l.954-2.408 2.395.848a.445.445 0 00.584-.574l-.848-2.394 2.408-.955.012-.005a.42.42 0 00.084-.05l.01-.007a.44.44 0 00.072-.066l.004-.005a.45.45 0 00.053-.078l.006-.013a.468.468 0 00.032-.078l.002-.006a.429.429 0 00.015-.09l.001-.02a.445.445 0 00-.001-.14l-.001-.02a.426.426 0 00-.015-.09z',
        // Obrazy
        png: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
        jpg: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
        jpeg: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
        gif: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
        svg: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
        // Archiwa
        zip: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z',
        tar: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z',
        gz: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-2 6h-2v2h2v2h-2v2h-2v-2h2v-2h-2v-2h2v-2h-2V8h2v2h2v2z',
    };

    return iconMap[ext] || 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z';
}
