'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DocumentCard from '@/components/ui/DocumentCard';
import FilterBar from '@/components/ui/FilterBar';
import { useDocuments } from '@/hooks/useDocuments';
import type { DocumentStatus } from '@/types';

function DocumentsContent() {
    const searchParams = useSearchParams();
    const initialStatus = searchParams.get('status') as DocumentStatus | null;

    const { documents, filteredDocuments, filters, updateFilter, resetFilters } = useDocuments();

    if (initialStatus && filters.status === 'todos' && !filters.search) {
        if (['aprobado', 'pendiente', 'revisar', 'observado', 'duplicado'].includes(initialStatus)) {
            setTimeout(() => updateFilter('status', initialStatus), 0);
        }
    }

    return (
        <div className="flex flex-col gap-6 pb-8">
            {/* Page header */}
            <div>
                <h1
                    className="text-[19px] font-bold tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                >
                    Documentos
                </h1>
                <p
                    className="text-sm mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                >
                    Facturas, comprobantes y órdenes de compra
                </p>
            </div>

            {/* Filters */}
            <FilterBar
                filters={filters}
                onFilterChange={updateFilter}
                onReset={resetFilters}
                total={documents.length}
                filtered={filteredDocuments.length}
            />

            {/* Document grid */}
            {filteredDocuments.length === 0 ? (
                <div
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 px-8 bg-white text-center"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <p
                        className="text-sm font-semibold mb-1"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        No se encontraron documentos
                    </p>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        Probá ajustando los filtros o realizando otra búsqueda.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredDocuments.map((doc, i) => (
                        <DocumentCard key={doc.id} document={doc} index={i} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DocumentsPage() {
    return (
        <Suspense
            fallback={
                <div className="p-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Cargando...
                </div>
            }
        >
            <DocumentsContent />
        </Suspense>
    );
}
