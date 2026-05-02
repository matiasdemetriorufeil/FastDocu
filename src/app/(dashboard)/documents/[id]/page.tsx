'use client';

import { useMemo, use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, FileText, History, ExternalLink,
    CheckCircle2, AlertTriangle, AlertCircle, Info,
    Building2, User, CreditCard, ShieldCheck,
} from 'lucide-react';
import { useDocuments } from '@/hooks/useDocuments';
import { mockDocuments } from '@/lib/mock-data';
import { validateDocument } from '@/lib/document-validation';
import { formatCurrency, formatDate } from '@/lib/validators';
import StatusBadge from '@/components/ui/StatusBadge';
import ValidationPanel from '@/components/ui/ValidationPanel';

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { getById } = useDocuments();
    const doc = getById(decodeURIComponent(id));

    if (!doc) notFound();

    const validationResult = useMemo(() => validateDocument(doc, mockDocuments), [doc]);

    const fechaEmision = formatDate(doc.fecha.split('T')[0]);
    const fechaCarga   = formatDate(doc.uploadedAt.split('T')[0]);
    const ivaLabel     = doc.ivaRate > 0 ? `IVA ${doc.ivaRate}%` : 'Exento';
    const ivaValue     = doc.ivaRate > 0 ? formatCurrency(doc.iva, doc.moneda) : '—';

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">

            {/* ── Top Bar ──────────────────────────────────────────────────── */}
            <div className="flex items-start gap-4">
                <Link
                    href="/documents"
                    className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white hover:bg-slate-50 transition-colors shadow-sm"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <ArrowLeft className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                </Link>

                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5 mb-1">
                        {doc.tipoLetra && (
                            <span
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white"
                                style={{ background: 'var(--accent)' }}
                            >
                                {doc.tipoLetra}
                            </span>
                        )}
                        <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            {doc.puntoVenta}-{doc.numeroComprobante}
                        </h1>
                        <StatusBadge status={validationResult.status} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{doc.proveedor}</span>
                        <span className="mx-2 opacity-40">·</span>
                        {fechaEmision}
                    </p>
                </div>

                {/* Ver archivo original (solo si existe el blob URL) */}
                {doc.fileUrl && (
                    <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-50 shadow-sm"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver archivo
                    </a>
                )}
            </div>

            {/* ── Main Grid ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: datos + validación ──────────────────────────────── */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Datos del comprobante */}
                    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>

                        {/* Card header */}
                        <div className="flex items-center gap-2.5 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                            <FileText className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Datos del Comprobante</span>
                        </div>

                        <div className="p-6 flex flex-col gap-6">

                            {/* Emisor */}
                            <FieldGroup icon={<Building2 className="h-3.5 w-3.5" />} title="Emisor">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <Field label="Razón Social" value={doc.proveedor} span={2} />
                                    <Field label="CUIT" value={doc.cuit || '—'} mono />
                                    {doc.condicionIva && <Field label="Condición IVA" value={doc.condicionIva} />}
                                    {doc.domicilioComercial && <Field label="Domicilio" value={doc.domicilioComercial} span={2} />}
                                </div>
                            </FieldGroup>

                            {/* Receptor (si está disponible) */}
                            {(doc.razonSocialReceptor || doc.cuitReceptor) && (
                                <FieldGroup icon={<User className="h-3.5 w-3.5" />} title="Receptor">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {doc.razonSocialReceptor && <Field label="Razón Social" value={doc.razonSocialReceptor} span={2} />}
                                        {doc.cuitReceptor && <Field label="CUIT" value={doc.cuitReceptor} mono />}
                                    </div>
                                </FieldGroup>
                            )}

                            {/* Comprobante */}
                            <FieldGroup icon={<CreditCard className="h-3.5 w-3.5" />} title="Comprobante">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <Field label="Punto de Venta" value={doc.puntoVenta} />
                                    <Field label="N° Comprobante" value={doc.numeroComprobante} />
                                    <Field label="Fecha Emisión" value={fechaEmision} />
                                    {doc.fechaVencimiento && (
                                        <Field label="Vto. CAE" value={formatDate(doc.fechaVencimiento)} />
                                    )}
                                </div>
                            </FieldGroup>

                            {/* CAE */}
                            {doc.cae && (
                                <FieldGroup icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Autorización AFIP">
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="CAE" value={doc.cae} mono />
                                        {doc.fechaVencimiento && (
                                            <Field label="Vencimiento" value={formatDate(doc.fechaVencimiento)} />
                                        )}
                                    </div>
                                </FieldGroup>
                            )}

                            {/* Orden de compra */}
                            {doc.ordenDeCompra && (
                                <div
                                    className="flex items-center justify-between rounded-xl px-4 py-3 border"
                                    style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}
                                >
                                    <div>
                                        <p className="text-xs font-bold text-sky-700 mb-0.5">Orden de Compra</p>
                                        <p className="text-sm font-semibold text-sky-900">{doc.ordenDeCompra}</p>
                                    </div>
                                </div>
                            )}

                            {/* Importes */}
                            <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                                <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
                                    <AmountCell label="Neto" value={formatCurrency(doc.neto, doc.moneda)} />
                                    <AmountCell label={ivaLabel} value={ivaValue} />
                                    <AmountCell
                                        label="Total"
                                        value={formatCurrency(doc.total, doc.moneda)}
                                        highlight
                                    />
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Validación */}
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                            Resultado de Validación
                        </p>
                        <ValidationPanel result={validationResult} />
                    </div>
                </div>

                {/* ── Right: estado + actividad ─────────────────────────────── */}
                <div className="lg:col-span-1 flex flex-col gap-5">

                    {/* Estado */}
                    <div className="rounded-2xl border bg-white shadow-sm p-5" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Estado</p>
                        <div className="flex flex-col gap-3">
                            <StatusBadge status={validationResult.status} size="lg" />
                            <div
                                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                                style={{
                                    background: validationResult.aptoPago ? '#ecfdf5' : '#fef2f2',
                                    borderColor: validationResult.aptoPago ? '#a7f3d0' : '#fca5a5',
                                }}
                            >
                                {validationResult.aptoPago
                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                    : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                                }
                                <span className={`text-xs font-bold ${validationResult.aptoPago ? 'text-emerald-800' : 'text-red-700'}`}>
                                    {validationResult.aptoPago ? 'Apto para pago' : 'No apto para pago'}
                                </span>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                {validationResult.decisionReason}
                            </p>
                        </div>
                    </div>

                    {/* Actividad */}
                    <div className="rounded-2xl border bg-white shadow-sm p-5" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <History className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Actividad</p>
                        </div>
                        <div className="relative flex flex-col gap-5 pl-4">
                            {/* línea vertical */}
                            <div className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-100" />

                            <TimelineItem
                                label="Validación automática"
                                sub="Sistema"
                                date={fechaCarga}
                                active
                            />
                            <TimelineItem
                                label="Documento cargado"
                                sub={doc.uploadedBy}
                                date={fechaCarga}
                            />
                        </div>
                    </div>

                    {/* Meta info */}
                    <div className="rounded-2xl border bg-white shadow-sm p-5" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-muted)' }}>Información</p>
                        <div className="flex flex-col gap-3">
                            <MiniField label="Archivo" value={doc.filename} />
                            <MiniField label="Moneda" value={doc.moneda === 'ARS' ? 'Peso Argentino (ARS)' : 'Dólar (USD)'} />
                            <MiniField label="Cargado por" value={doc.uploadedBy} />
                            <MiniField label="Fecha de carga" value={fechaCarga} />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function FieldGroup({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-3">
                <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    {title}
                </p>
            </div>
            {children}
        </div>
    );
}

function Field({
    label,
    value,
    span = 1,
    mono = false,
}: {
    label: string;
    value: string;
    span?: number;
    mono?: boolean;
}) {
    return (
        <div style={{ gridColumn: span > 1 ? `span ${span} / span ${span}` : undefined }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                {label}
            </p>
            <p
                className={`text-sm font-semibold ${mono ? 'font-mono tracking-wide' : ''}`}
                style={{ color: 'var(--text-primary)' }}
            >
                {value}
            </p>
        </div>
    );
}

function AmountCell({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center px-4 py-4 text-center"
            style={{ background: highlight ? '#f5f3ff' : '#f8fafc' }}
        >
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                {label}
            </p>
            <p
                className={`font-bold ${highlight ? 'text-base text-indigo-700' : 'text-sm'}`}
                style={{ color: highlight ? undefined : 'var(--text-primary)' }}
            >
                {value}
            </p>
        </div>
    );
}

function TimelineItem({
    label,
    sub,
    date,
    active = false,
}: {
    label: string;
    sub: string;
    date: string;
    active?: boolean;
}) {
    return (
        <div className="flex items-start gap-3 relative">
            <span
                className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-white shrink-0"
                style={{ background: active ? 'var(--accent)' : '#cbd5e1' }}
            />
            <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{sub} · {date}</p>
            </div>
        </div>
    );
}

function MiniField({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between items-baseline gap-3">
            <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="text-xs font-semibold text-right truncate" style={{ color: 'var(--text-secondary)' }}>{value}</span>
        </div>
    );
}
