'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FileText, CheckCircle2, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import MetricCard from '@/components/ui/MetricCard';
import CapabilityCard from '@/components/ui/CapabilityCard';
import DocumentCard from '@/components/ui/DocumentCard';
import { useDocuments } from '@/hooks/useDocuments';
import { capabilities, computeMetrics } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/validators';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
}

function getFormattedDate() {
    return new Date().toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).replace(/^\w/, (c) => c.toUpperCase());
}

export default function InboxDashboardPage() {
    const { documents } = useDocuments();
    const metrics = useMemo(() => computeMetrics(documents), [documents]);
    const recentDocs = documents.slice(0, 8);

    return (
        <div className="flex flex-col gap-5 pb-6">

            {/* Greeting */}
            <div>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                        {getGreeting()}, Laura
                    </h1>
                    <span className="text-[12px] font-medium hidden md:block" style={{ color: 'var(--text-muted)' }}>
                        {getFormattedDate()}
                    </span>
                </div>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Resumen de actividad del equipo
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard
                    label="Total Procesado"
                    value={formatCurrency(metrics.montoTotal)}
                    icon={<FileText className="h-3.5 w-3.5" />}
                    color="#3b82f6"
                    bgColor="#eff6ff"
                    delta={12.5}
                    index={0}
                />
                <MetricCard
                    label="Aprobados"
                    value={metrics.aprobados}
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    color="#16a34a"
                    bgColor="#f0fdf4"
                    delta={5.2}
                    index={1}
                />
                <MetricCard
                    label="Pendientes"
                    value={metrics.pendientes}
                    icon={<Clock className="h-3.5 w-3.5" />}
                    color="#ca8a04"
                    bgColor="#fefce8"
                    index={2}
                />
                <MetricCard
                    label="Inconsistencias"
                    value={metrics.revisar + metrics.observados + metrics.duplicados}
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                    color="#ea580c"
                    bgColor="#fff7ed"
                    delta={-2.4}
                    index={3}
                />
            </div>

            {/* Bottom grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Módulos — 2/3 */}
                <div className="col-span-2 flex flex-col gap-3">
                    <SectionHeader title="Módulos de Validación" />
                    <div className="flex flex-col gap-1.5">
                        {capabilities.map((cap, i) => (
                            <CapabilityCard key={cap.id} capability={cap} index={i} />
                        ))}
                    </div>
                </div>

                {/* Ingresos Recientes — 1/3 */}
                <div className="col-span-1 flex flex-col gap-3">
                    <SectionHeader
                        title="Ingresos Recientes"
                        action={
                            <Link
                                href="/documents"
                                className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                                style={{ color: 'var(--accent)' }}
                            >
                                Ver todos <ArrowRight className="h-3 w-3" />
                            </Link>
                        }
                    />
                    <div className="flex flex-col gap-1.5">
                        {recentDocs.map((doc, i) => (
                            <DocumentCard key={doc.id} document={doc} index={i} compact />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionHeader({
    title,
    action,
}: {
    title: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span
                    className="h-3.5 w-[3px] rounded-full"
                    style={{ background: 'var(--accent)', display: 'inline-block' }}
                />
                <h2
                    className="text-[13px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {title}
                </h2>
            </div>
            {action}
        </div>
    );
}
