'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
    X, Upload, CheckCircle2, AlertCircle, Loader2,
    ExternalLink, Building2, User, DollarSign, ShieldCheck,
    FileText, RotateCcw, ArrowRight, AlertTriangle, XCircle, QrCode,
} from 'lucide-react';
import { useDocuments } from '@/hooks/useDocuments';
import { formatCurrency } from '@/lib/validators';
import type { Document, DocumentStatus, IVARate } from '@/types';
import type { ValidationOutput, InvoiceData, ValidationScore, QrSource } from '@/lib/ocr/types';

interface UploadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const TIPO_LABEL: Record<string, string> = { A: 'Factura A', B: 'Factura B', C: 'Factura C' };

function val(v: string | number | null | undefined, fallback = '—'): string {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
}

function formatARS(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return formatCurrency(n, 'ARS');
}

function inferIvaRate(inv: InvoiceData): IVARate {
    if (!inv.iva || inv.iva === 0) return 0;
    if (!inv.subtotal || inv.subtotal === 0) return 0;
    const rate = Math.round((inv.iva / inv.subtotal) * 100);
    if (rate <= 1) return 0;
    if (rate <= 11) return 10.5;
    if (rate <= 22) return 21;
    return 27;
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
    const router = useRouter();
    const { addDocument } = useDocuments();

    const [uploadState, setUploadState] = useState<UploadState>('idle');
    const [isDragging, setIsDragging] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [newDocId, setNewDocId] = useState<string | null>(null);
    const [result, setResult] = useState<ValidationOutput | null>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);

    const processAndUpload = async (file: File) => {
        setFileName(file.name);
        setUploadState('uploading');
        setError(null);

        // Crear URL del archivo para poder verlo después
        const blobUrl = URL.createObjectURL(file);
        setFileUrl(blobUrl);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/ocr', { method: 'POST', body: formData });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'No se pudo procesar el archivo.');

            const output = data as ValidationOutput;
            setResult(output);

            // Mapear estado final usando apto_pago del DecisionEngine
            let finalStatus: DocumentStatus;
            if (output.apto_pago) {
                finalStatus = 'aprobado';
            } else if (output.estado_final === 'INVALIDO') {
                finalStatus = 'observado';
            } else if (output.score.confidence === 'no_procesado') {
                finalStatus = 'pendiente';
            } else {
                finalStatus = 'revisar';
            }

            const inv = output.invoice;
            const docId = `DOC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
            const numParts = inv.numero_factura?.split('-') ?? [];

            const newDoc: Document = {
                id: docId,
                filename: file.name,
                type: 'factura',
                tipoLetra: inv.tipo_factura ?? undefined,
                proveedor: inv.razon_social_emisor || 'Sin identificar',
                cuit: inv.cuit_emisor?.replace(/\D/g, '') || '',
                fecha: inv.fecha_emision ? `${inv.fecha_emision}T12:00:00.000Z` : new Date().toISOString(),
                puntoVenta: numParts[0] || '0000',
                numeroComprobante: numParts[1] || '00000000',
                status: finalStatus,
                moneda: 'ARS',
                neto: inv.subtotal ?? inv.total ?? 0,
                iva: inv.iva ?? 0,
                ivaRate: inferIvaRate(inv),
                total: inv.total ?? 0,
                cae: inv.cae ?? undefined,
                fechaVencimiento: inv.fecha_vencimiento_cae ?? undefined,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'Subido manualmente',
                observaciones: output.warnings.length > 0 ? output.warnings.join(' | ') : undefined,
                fileUrl: blobUrl,
                razonSocialReceptor: inv.razon_social_receptor ?? undefined,
                cuitReceptor: inv.cuit_receptor ?? undefined,
                condicionIvaReceptor: inv.condicion_iva_receptor ?? undefined,
                domicilioComercial: inv.domicilio_comercial ?? undefined,
                domicilioReceptor: inv.domicilio_receptor ?? undefined,
                condicionIva: inv.condicion_iva ?? undefined,
                condicionVenta: inv.condicion_venta ?? undefined,
                descripcion: inv.descripcion ?? undefined,
                periodo: inv.periodo ?? undefined,
                fechaVencimientoPago: inv.fecha_vencimiento_pago ?? undefined,
            };

            addDocument(newDoc);
            setNewDocId(docId);
            setUploadState('success');

        } catch (err: any) {
            setError(err.message);
            setUploadState('error');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processAndUpload(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processAndUpload(file);
        e.target.value = '';
    };

    const handleReset = () => {
        setUploadState('idle');
        setFileName(null);
        setError(null);
        setNewDocId(null);
        setResult(null);
        // No revocar fileUrl porque se guardó en el documento
        setFileUrl(null);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const handleGoToDoc = () => {
        if (newDocId) {
            router.push(`/documents/${newDocId}`);
            handleClose();
        }
    };

    const inv          = result?.invoice;
    const score        = result?.score;
    const reconciliation = result?.reconciliation;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
                        onClick={uploadState === 'uploading' ? undefined : handleClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        className="fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
                        style={{
                            maxWidth: uploadState === 'success' ? '560px' : '440px',
                            maxHeight: '90vh',
                        }}
                    >
                        <div className="rounded-2xl bg-white premium-shadow overflow-hidden">

                            {/* ── IDLE: zona de carga ───────────────────── */}
                            {uploadState === 'idle' && (
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-5">
                                        <div>
                                            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                                                Subir Factura
                                            </h2>
                                            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                PDF o imagen — los datos se extraen automáticamente
                                            </p>
                                        </div>
                                        <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                                            <X className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
                                        </button>
                                    </div>

                                    <label
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={handleDrop}
                                        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all"
                                        style={{
                                            borderColor: isDragging ? 'var(--accent)' : 'var(--border)',
                                            background: isDragging ? '#eff6ff' : '#f8fafc',
                                        }}
                                    >
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4 transition-colors"
                                            style={{ background: isDragging ? '#dbeafe' : '#e0e7ff' }}>
                                            <Upload className="h-6 w-6 transition-colors" style={{ color: isDragging ? '#2563eb' : 'var(--accent)' }} />
                                        </div>
                                        <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                                            Arrastrá tu factura aquí
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>o hacé clic para seleccionar</p>
                                        <p className="text-[10px] mt-4 font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-200/70" style={{ color: 'var(--text-muted)' }}>
                                            PDF · PNG · JPG
                                        </p>
                                        <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} />
                                    </label>
                                </div>
                            )}

                            {/* ── UPLOADING ─────────────────────────────── */}
                            {uploadState === 'uploading' && (
                                <div className="p-8 flex flex-col items-center justify-center text-center">
                                    <div className="relative mb-5">
                                        <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: '#eff6ff' }}>
                                            <FileText className="h-7 w-7 text-indigo-400" />
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white flex items-center justify-center shadow-sm">
                                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                        </div>
                                    </div>
                                    <p className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                                        Extrayendo datos...
                                    </p>
                                    <p className="text-sm truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>{fileName}</p>
                                </div>
                            )}

                            {/* ── SUCCESS ───────────────────────────────── */}
                            {uploadState === 'success' && result && inv && (
                                <>
                                    {/* Banner dinámico según apto_pago */}
                                    <ResultBanner output={result} fileName={fileName} onClose={handleClose} />

                                    {/* Cuerpo con datos extraídos */}
                                    <div className="p-5 space-y-4">

                                        {/* Encabezado del comprobante */}
                                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border"
                                            style={{ borderColor: 'var(--border)', background: '#f8fafc' }}>
                                            <div className="flex items-center gap-3">
                                                {inv.tipo_factura && (
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black text-white flex-shrink-0"
                                                        style={{ background: 'var(--accent)' }}>
                                                        {inv.tipo_factura}
                                                    </span>
                                                )}
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                                                        {inv.tipo_factura ? TIPO_LABEL[inv.tipo_factura] : 'Comprobante'}
                                                    </p>
                                                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                                        {val(inv.numero_factura)} <span className="font-normal text-xs opacity-60">·</span>{' '}
                                                        <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>
                                                            {inv.fecha_emision ?? '—'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            {fileUrl && (
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-indigo-50 border"
                                                    style={{ color: 'var(--accent)', borderColor: '#c7d2fe' }}>
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                    Ver archivo
                                                </a>
                                            )}
                                        </div>

                                        {/* Validación */}
                                        <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Validación">
                                            {score && <ScoreBar score={score} />}
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fuente</span>
                                                <QrBadge source={reconciliation?.qr_source ?? null} />
                                            </div>
                                            {result.decision_reason && (
                                                <p className="mt-2 text-xs rounded-lg px-2.5 py-2 bg-slate-50 leading-relaxed"
                                                    style={{ color: 'var(--text-secondary)' }}>
                                                    {result.decision_reason}
                                                </p>
                                            )}
                                            {reconciliation && reconciliation.critical_mismatches.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {reconciliation.critical_mismatches.map(field => (
                                                        <div key={field} className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">
                                                            <XCircle className="h-3 w-3 flex-shrink-0" />
                                                            <span className="font-bold">Crítico:</span>
                                                            <span className="font-mono">{field}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {reconciliation && reconciliation.warning_mismatches.length > 0 && (
                                                <div className="mt-1 space-y-1">
                                                    {reconciliation.warning_mismatches.map(field => (
                                                        <div key={field} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                                                            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                                            <span className="font-bold">Advertencia:</span>
                                                            <span className="font-mono">{field}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {result.warnings.length > 0 && (
                                                <div className="mt-1 space-y-1">
                                                    {result.warnings.map((w, i) => (
                                                        <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
                                                            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5 text-slate-400" />
                                                            <span>{w}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </Section>

                                        {/* Emisor */}
                                        <Section icon={<Building2 className="h-3.5 w-3.5" />} title="Emisor">
                                            <DataRow label="Razón social" value={val(inv.razon_social_emisor)} strong />
                                            <DataRow label="CUIT" value={val(inv.cuit_emisor)} />
                                            <DataRow label="Condición IVA" value={val(inv.condicion_iva)} />
                                            {inv.domicilio_comercial && (
                                                <DataRow label="Domicilio" value={val(inv.domicilio_comercial)} />
                                            )}
                                        </Section>

                                        {/* Receptor (si hay datos) */}
                                        {(inv.razon_social_receptor || inv.cuit_receptor) && (
                                            <Section icon={<User className="h-3.5 w-3.5" />} title="Receptor">
                                                {inv.razon_social_receptor && (
                                                    <DataRow label="Razón social" value={val(inv.razon_social_receptor)} strong />
                                                )}
                                                <DataRow label="CUIT" value={val(inv.cuit_receptor)} />
                                                {inv.condicion_iva_receptor && (
                                                    <DataRow label="Condición IVA" value={val(inv.condicion_iva_receptor)} />
                                                )}
                                                {inv.domicilio_receptor && (
                                                    <DataRow label="Domicilio" value={val(inv.domicilio_receptor)} />
                                                )}
                                            </Section>
                                        )}

                                        {/* Operación */}
                                        {(inv.descripcion || inv.periodo || inv.condicion_venta || inv.fecha_vencimiento_pago) && (
                                            <Section icon={<FileText className="h-3.5 w-3.5" />} title="Operación">
                                                {inv.descripcion && (
                                                    <DataRow label="Descripción" value={val(inv.descripcion)} />
                                                )}
                                                {inv.periodo && (
                                                    <DataRow label="Período" value={val(inv.periodo)} />
                                                )}
                                                {inv.condicion_venta && (
                                                    <DataRow label="Cond. de venta" value={val(inv.condicion_venta)} />
                                                )}
                                                {inv.fecha_vencimiento_pago && (
                                                    <DataRow label="Vto. pago" value={val(inv.fecha_vencimiento_pago)} />
                                                )}
                                            </Section>
                                        )}

                                        {/* Montos */}
                                        <Section icon={<DollarSign className="h-3.5 w-3.5" />} title="Importes">
                                            <div className="grid grid-cols-3 gap-3">
                                                <AmountBlock label="Neto" amount={inv.subtotal} />
                                                <AmountBlock label="IVA" amount={inv.iva} />
                                                <AmountBlock label="Total" amount={inv.total} highlight />
                                            </div>
                                        </Section>

                                        {/* Autorización */}
                                        {(inv.cae || inv.fecha_vencimiento_cae) && (
                                            <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Autorización AFIP">
                                                <DataRow label="CAE" value={val(inv.cae)} mono />
                                                <DataRow label="Fecha de vencimiento" value={val(inv.fecha_vencimiento_cae)} />
                                            </Section>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                        <button onClick={handleReset}
                                            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold border hover:bg-slate-50 transition-colors"
                                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Cargar otra
                                        </button>
                                        <button onClick={handleGoToDoc}
                                            className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white shadow-md hover:shadow-indigo-500/30 transition-all"
                                            style={{ background: 'var(--accent)' }}>
                                            Ver en Documentos
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ── ERROR ─────────────────────────────────── */}
                            {uploadState === 'error' && (
                                <div className="p-6">
                                    <div className="flex flex-col items-center text-center rounded-2xl border p-8"
                                        style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
                                        <AlertCircle className="h-10 w-10 mb-3 text-red-500" />
                                        <p className="text-sm font-bold mb-1 text-red-900">No se pudo procesar el archivo</p>
                                        <p className="text-xs font-medium text-red-700 mb-4">{error}</p>
                                        <button onClick={handleReset}
                                            className="px-4 py-2 bg-red-100 font-bold text-red-800 text-xs rounded-lg hover:bg-red-200 transition-colors">
                                            Intentar de nuevo
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: '#f8fafc' }}>
                <span style={{ color: 'var(--accent)' }}>{icon}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</p>
            </div>
            <div className="px-3 py-2.5 space-y-1.5 bg-white">
                {children}
            </div>
        </div>
    );
}

function DataRow({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className={`text-xs text-right truncate ${strong ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono tracking-wide' : ''}`}
                style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {value}
            </span>
        </div>
    );
}

function AmountBlock({ label, amount, highlight }: { label: string; amount: number | null | undefined; highlight?: boolean }) {
    return (
        <div className={`rounded-lg p-2 text-center ${highlight ? 'ring-1 ring-indigo-200' : ''}`}
            style={{ background: highlight ? '#eff6ff' : '#f8fafc' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className={`text-sm font-bold ${highlight ? 'text-indigo-700' : ''}`}
                style={{ color: highlight ? undefined : 'var(--text-primary)' }}>
                {amount !== null && amount !== undefined ? formatCurrency(amount, 'ARS') : '—'}
            </p>
        </div>
    );
}

// ── Banner dinámico ───────────────────────────────────────────────────────────

function ResultBanner({ output, fileName, onClose }: {
    output: ValidationOutput;
    fileName: string | null;
    onClose: () => void;
}) {
    const isApproved = output.apto_pago;
    const isInvalid  = output.estado_final === 'INVALIDO';

    const bg    = isApproved ? 'linear-gradient(to right, #d1fae5, #ecfdf5)'
                : isInvalid  ? 'linear-gradient(to right, #fee2e2, #fef2f2)'
                             : 'linear-gradient(to right, #fef3c7, #fffbeb)';
    const [tc, sc, hc, cc] = isApproved
        ? ['text-emerald-800', 'text-emerald-700', 'hover:bg-emerald-100', 'text-emerald-600']
        : isInvalid
        ? ['text-red-800',     'text-red-700',     'hover:bg-red-100',     'text-red-600'    ]
        : ['text-amber-800',   'text-amber-700',   'hover:bg-amber-100',   'text-amber-600'  ];
    const title = isApproved ? `Apto para pago · ${output.score.total}/100`
                : isInvalid  ? 'Rechazado — inconsistencia crítica'
                             : `Requiere revisión · ${output.score.total}/100`;
    const Icon = isApproved ? CheckCircle2 : isInvalid ? XCircle : AlertTriangle;
    const iconClass = isApproved ? 'text-emerald-600' : isInvalid ? 'text-red-500' : 'text-amber-600';

    return (
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: bg }}>
            <Icon className={`h-5 w-5 flex-shrink-0 ${iconClass}`} />
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${tc}`}>{title}</p>
                <p className={`text-xs truncate ${sc}`}>{fileName}</p>
            </div>
            <button onClick={onClose}
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${hc} transition-colors flex-shrink-0`}>
                <X className={`h-3.5 w-3.5 ${cc}`} />
            </button>
        </div>
    );
}

// ── Score bar ─────────────────────────────────────────────────────────────────

const CONFIDENCE_LABELS = { alta: 'Alta', media: 'Media', baja: 'Baja', no_procesado: 'Sin datos' };
const CONFIDENCE_COLORS = {
    alta:         { fill: '#10b981', badge: 'bg-emerald-50 text-emerald-700' },
    media:        { fill: '#f59e0b', badge: 'bg-amber-50 text-amber-700'     },
    baja:         { fill: '#f97316', badge: 'bg-orange-50 text-orange-700'   },
    no_procesado: { fill: '#94a3b8', badge: 'bg-slate-100 text-slate-500'    },
};

function ScoreBar({ score }: { score: ValidationScore }) {
    const c = CONFIDENCE_COLORS[score.confidence];
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Score de validación
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                    {score.total}/100 · {CONFIDENCE_LABELS[score.confidence]}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                    style={{ width: `${score.total}%`, background: c.fill }} />
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                {([
                    ['QR',       score.breakdown.qr_presence,    20],
                    ['Críticos', score.breakdown.critical_fields, 40],
                    ['Montos',   score.breakdown.amount_coherence, 20],
                    ['Completo', score.breakdown.completeness,    20],
                ] as [string, number, number][]).map(([label, pts, max]) => (
                    <div key={label} className="text-center rounded-lg py-1.5 px-1 bg-slate-50">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
                        <p className="text-xs font-bold text-slate-700">
                            {pts}<span className="text-[9px] font-normal text-slate-400">/{max}</span>
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── QR source badge ───────────────────────────────────────────────────────────

const QR_SOURCE_LABELS: Record<NonNullable<QrSource>, string> = {
    url:         'QR AFIP (URL)',
    barcode:     'Código de barras',
    image_scan:  'QR escaneado',
};

function QrBadge({ source }: { source: QrSource }) {
    if (!source) {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                Solo OCR
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            <QrCode className="h-2.5 w-2.5" />
            {QR_SOURCE_LABELS[source]}
        </span>
    );
}
