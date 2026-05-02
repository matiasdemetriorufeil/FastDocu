import { create } from 'zustand';
import { mockDocuments } from '@/lib/mock-data';
import type { Document, DocumentFilters, DocumentStatus } from '@/types';

const defaultFilters: DocumentFilters = {
    search: '',
    status: 'todos',
    type: 'todos',
};

interface DocumentsState {
    documents: Document[];
    filters: DocumentFilters;
    updateFilter: <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => void;
    resetFilters: () => void;
    addDocument: (doc: Document) => void;
    updateStatus: (id: string, status: DocumentStatus) => void;
}

export const useDocumentsStore = create<DocumentsState>((set) => ({
    documents: [...mockDocuments],
    filters: defaultFilters,
    updateFilter: (key, value) => set((state) => ({
        filters: { ...state.filters, [key]: value }
    })),
    resetFilters: () => set({ filters: defaultFilters }),
    addDocument: (doc) => set((state) => ({
        documents: [doc, ...state.documents]
    })),
    updateStatus: (id, status) => set((state) => ({
        documents: state.documents.map((d) => (d.id === id ? { ...d, status } : d)),
    })),
}));

export function useDocuments() {
    const store = useDocumentsStore();

    const filteredDocuments = store.documents.filter((doc) => {
        // Search
        if (store.filters.search) {
            const q = store.filters.search.toLowerCase();
            const matches =
                doc.proveedor.toLowerCase().includes(q) ||
                doc.cuit.includes(q) ||
                doc.filename.toLowerCase().includes(q) ||
                doc.numeroComprobante.includes(q) ||
                (doc.ordenDeCompra?.toLowerCase().includes(q) ?? false);
            if (!matches) return false;
        }

        // Status
        if (store.filters.status !== 'todos' && doc.status !== store.filters.status) {
            return false;
        }

        // Type
        if (store.filters.type !== 'todos' && doc.type !== store.filters.type) {
            return false;
        }

        // Date range
        if (store.filters.dateFrom && doc.fecha < store.filters.dateFrom) return false;
        if (store.filters.dateTo && doc.fecha > store.filters.dateTo) return false;

        return true;
    });

    const getById = (id: string) => store.documents.find((d) => d.id === id);

    return {
        documents: store.documents,
        filteredDocuments,
        filters: store.filters,
        updateFilter: store.updateFilter,
        resetFilters: store.resetFilters,
        addDocument: store.addDocument,
        updateStatus: store.updateStatus,
        getById,
    };
}
