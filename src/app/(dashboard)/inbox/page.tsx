'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FileText, CheckCircle2, Clock, AlertTriangle, Copy, XCircle, ArrowRight } from 'lucide-react';
import MetricCard from '@/components/ui/MetricCard';
import CapabilityCard from '@/components/ui/CapabilityCard';
import DocumentCard from '@/components/ui/DocumentCard';
import { useDocuments } from '@/hooks/useDocuments';
import { capabilities, computeMetrics } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/validators';

export default function InboxDashboardPage() {
    const { documents } = useDocuments();
    const metrics = useMemo(() => computeMetrics(documents), [documents]);

    const recentDocs = documents.slice(0, 4);

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                    Resumen de Validación
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Métricas y estado general de los documentos administrativos ingresados.
                </p>
            </div>

            {/* Primary KPI */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Total Procesado"
                    value={formatCurrency(metrics.montoTotal)}
                    icon={<FileText className="h-5 w-5" />}
                    color="#3b82f6"
                    bgColor="#eff6ff"
                    delta={12.5}
                    deltaLabel="vs. mes anterior"
                />
                <MetricCard
                    label="Aprobados Directos"
                    value={metrics.aprobados}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    color="#16a34a"
                    bgColor="#f0fdf4"
                    delta={5.2}
                    index={1}
                />
                <MetricCard
                    label="Pendientes"
                    value={metrics.pendientes}
                    icon={<Clock className="h-5 w-5" />}
                    color="#ca8a04"
                    bgColor="#fefce8"
                    index={2}
                />
                <MetricCard
                    label="Inconsistencias y Errores"
                    value={metrics.revisar + metrics.observados + metrics.duplicados}
                    icon={<AlertTriangle className="h-5 w-5" />}
                    color="#ea580c"
                    bgColor="#fff7ed"
                    delta={-2.4}
                    index={3}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Col: Capabilities Showcase */}
                <div className="col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Módulos de Validación</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {capabilities.map((cap, i) => (
                            <CapabilityCard key={cap.id} capability={cap} index={i} />
                        ))}
                    </div>
                </div>

                {/* Right Col: Recent Activity */}
                <div className="col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Ingresos Recientes</h2>
                        <Link
                            href="/documents"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                            Ver todos <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                        {recentDocs.map((doc, i) => (
                            <DocumentCard key={doc.id} document={doc} index={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
