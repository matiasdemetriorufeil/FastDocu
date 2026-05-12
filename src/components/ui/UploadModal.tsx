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
    const [isDragging, setIsDragging]   = useState(false);
    const [fileName, setFileName]       = useState<string | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [newDocId, setNewDocId]       = useState<string | null>(null);
    const [result, setResult]           = useState<ValidationOutput | null>(null);
    const [fileUrl, setFileUrl]         = useState<string | null>(null);

    const processAndUpload = async (file: File) => {
        setFileName(file.name);
        setUploadState('uploading');
        setError(null);

        const blobUrl = URL.createObjectURL(file);
        setFileUrl(blobUrl);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res  = await fetch('/api/ocr', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo procesar el archivo.');

            const output = data as ValidationOutput;
            setResult(output);

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

            const inv      = output.invoice;
            const docId    = `DOC-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
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

    const inv            = result?.invoice;
    const score          = result?.score;
    const reconciliation = result?.reconciliation;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px]"
                        onClick={uploadState === 'uploading' ? undefined : handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        className="fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto"
                        style={{
                            maxWidth: uploadState === 'success' ? '580px' : '460px',
                            maxHeight: '90vh',
                        }}
                    >
                        <div
                            className="rounded-2xl bg-white overflow-hidden"
                            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)' }}
                        >

                            {/* ── IDLE ─────────────────────────────────── */}
                            {uploadState === 'idle' && (
                                <div>
                                    <div className="flex items-start justify-between px-6 pt-5 pb-4">
                                        <div>
                                            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                                                Subir factura
                                            </h2>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                PDF o imagen — los datos se extraen automáticamente
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleClose}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 flex-shrink-0"
                                        >
                                            <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                                        </button>
                                    </div>

                                    <div className="px-6 pb-6">
                                        <label
                                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                            onDragLeave={() => setIsDragging(false)}
                                            onDrop={handleDrop}
                                            className="relative flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all duration-200 overflow-hidden select-none"
                                            style={{
                                                minHeight: '210px',
                                                background: isDragging
                                                    ? 'linear-gradient(145deg, #eff6ff 0%, #eef2ff 100%)'
                                                    : '#f8fafc',
                                                border: `2px dashed ${isDragging ? 'var(--accent)' : '#d1d5db'}`,
                                            }}
                                        >
                                            <motion.div
                                                animate={isDragging
                                                    ? { y: -6, scale: 1.06 }
                                                    : { y: 0, scale: 1 }}
                                                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                                className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                                                style={{
                                                    background: isDragging
                                                        ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                                        : 'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
                                                    boxShadow: isDragging
                                                        ? '0 8px 24px rgba(79,70,229,0.3)'
                                                        : 'none',
                                                }}
                                            >
                                                <Upload
                                                    className="h-6 w-6 transition-colors"
                                                    style={{ color: isDragging ? '#fff' : 'var(--accent)' }}
                                                />
                                            </motion.div>

                                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                                {isDragging ? 'Soltá el archivo aquí' : 'Arrastrá tu factura aquí'}
                                            </p>
                                            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                                                o hacé clic para seleccionar
                                            </p>

                                            <div className="flex items-center gap-2">
                                                {['PDF', 'PNG', 'JPG'].map((ext) => (
                                                    <span
                                                        key={ext}
                                                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white border"
                                                        style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                                                    >
                                                        {ext}
                                                    </span>
                                                ))}
                                            </div>

                                            <input
                                                type="file"
                                                className="hidden"
                                                accept=".pdf,.png,.jpg,.jpeg"
                                                onChange={handleFileChange}
                                            />
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* ── UPLOADING ───────────────────────────── */}
                            {uploadState === 'uploading' && (
                                <div className="px-8 py-14 flex flex-col items-center justify-center text-center">
                                    <motion.div
                                        animate={{
                                            boxShadow: [
                                                '0 0 0 0 rgba(79,70,229,0.18)',
                                                '0 0 0 18px rgba(79,70,229,0)',
                                                '0 0 0 0 rgba(79,70,229,0)',
                                            ],
                                        }}
                                        transition={{ duration: 1.6, repeat: Infinity }}
                                        className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
                                        style={{
                                            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                                        }}
                                    >
                                        <FileText className="h-7 w-7 text-indigo-500" />
                                        <div className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full bg-white flex items-center justify-center shadow-md">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                                        </div>
                                    </motion.div>

                                    <p className="text-base font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                                        Analizando factura...
                                    </p>
                                    <p className="text-sm truncate max-w-[300px] mb-1" style={{ color: 'var(--text-secondary)' }}>
                                        {fileName}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        Esto puede tomar unos segundos
                                    </p>
                                </div>
                            )}

                            {/* ── SUCCESS ─────────────────────────────── */}
                            {uploadState === 'success' && result && inv && (
                                <>
                                    <ResultBanner output={result} fileName={fileName} onClose={handleClose} />

                                    <div className="p-5 space-y-3">

                                        {/* Encabezado del comprobante */}
                                        <div
                                            className="flex items-center justify-between gap-3 p-3.5 rounded-xl"
                                            style={{ background: '#f8fafc', border: '1px solid var(--border)' }}
                                        >
                                            <div className="flex items-center gap-3">
                                                {inv.tipo_factura && (
                                                    <span
                                                        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black text-white flex-shrink-0"
                                                        style={{ background: 'var(--accent)' }}
                                                    >
                                                        {inv.tipo_factura}
                                                    </span>
                                                )}
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                                                        {inv.tipo_factura ? TIPO_LABEL[inv.tipo_factura] : 'Comprobante'}
                                                    </p>
                                                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                                        {val(inv.numero_factura)}
                                                        <span className="mx-1.5 font-normal text-xs opacity-40">·</span>
                                                        <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>
                                                            {inv.fecha_emision ?? '—'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            {fileUrl && (
                                                <a
                                                    href={fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-indigo-50 border"
                                                    style={{ color: 'var(--accent)', borderColor: '#c7d2fe' }}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                    Ver archivo
                                                </a>
                                            )}
                                        </div>

                                        {/* Validación */}
                                        <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Validación">
                                            {score && <ScoreBar score={score} />}
                                            <div className="flex items-center justify-between mt-2.5">
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fuente</span>
                                                <QrBadge source={reconciliation?.qr_source ?? null} />
                                            </div>
                                            {result.decision_reason && (
                                                <p
                                                    className="mt-2 text-xs rounded-lg px-3 py-2 leading-relaxed"
                                                    style={{ background: '#f8fafc', color: 'var(--text-secondary)' }}
                                                >
                                                    {result.decision_reason}
                                                </p>
                                            )}
                                            {reconciliation && reconciliation.critical_mismatches.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {reconciliation.critical_mismatches.map((field) => (
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
                                                    {reconciliation.warning_mismatches.map((field) => (
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
                                            <DataRow label="Razón social"  value={val(inv.razon_social_emisor)} strong />
                                            <DataRow label="CUIT"          value={val(inv.cuit_emisor)} />
                                            <DataRow label="Condición IVA" value={val(inv.condicion_iva)} />
                                            {inv.domicilio_comercial && (
                                                <DataRow label="Domicilio" value={val(inv.domicilio_comercial)} />
                                            )}
                                        </Section>

                                        {/* Receptor */}
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
                                                {inv.descripcion    && <DataRow label="Descripción" value={val(inv.descripcion)} />}
                                                {inv.periodo        && <DataRow label="Período"     value={val(inv.periodo)} />}
                                                {inv.condicion_venta && <DataRow label="Cond. venta" value={val(inv.condicion_venta)} />}
                                                {inv.fecha_vencimiento_pago && <DataRow label="Vto. pago" value={val(inv.fecha_vencimiento_pago)} />}
                                            </Section>
                                        )}

                                        {/* Importes */}
                                        <Section icon={<DollarSign className="h-3.5 w-3.5" />} title="Importes">
                                            <AmountRow
                                                neto={inv.subtotal}
                                                iva={inv.iva}
                                                total={inv.total}
                                            />
                                        </Section>

                                        {/* Autorización */}
                                        {(inv.cae || inv.fecha_vencimiento_cae) && (
                                            <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Autorización AFIP">
                                                <DataRow label="CAE"                value={val(inv.cae)} mono />
                                                <DataRow label="Fecha de vencimiento" value={val(inv.fecha_vencimiento_cae)} />
                                            </Section>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div
                                        className="flex items-center justify-between gap-3 px-5 py-4 border-t"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <button
                                            onClick={handleReset}
                                            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold border transition-colors hover:bg-slate-50"
                                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            Cargar otra
                                        </button>
                                        <motion.button
                                            onClick={handleGoToDoc}
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.97 }}
                                            className="flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white transition-shadow"
                                            style={{
                                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                                            }}
                                        >
                                            Ver en Documentos
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </motion.button>
                                    </div>
                                </>
                            )}

                            {/* ── ERROR ───────────────────────────────── */}
                            {uploadState === 'error' && (
                                <div className="p-6">
                                    <div
                                        className="flex flex-col items-center text-center rounded-2xl p-8"
                                        style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
                                    >
                                        <div
                                            className="flex h-12 w-12 items-center justify-center rounded-2xl mb-4"
                                            style={{ background: '#fee2e2' }}
                                        >
                                            <AlertCircle className="h-6 w-6 text-red-500" />
                                        </div>
                                        <p className="text-sm font-bold mb-1 text-red-900">
                                            No se pudo procesar el archivo
                                        </p>
                                        <p className="text-xs font-medium text-red-600 mb-5">{error}</p>
                                        <button
                                            onClick={handleReset}
                                            className="px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                                            style={{ background: '#fee2e2', color: '#991b1b' }}
                                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#fecaca'; }}
                                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#fee2e2'; }}
                                        >
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

function Section({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
                className="flex items-center gap-2 px-3.5 py-2 border-b"
                style={{ borderColor: 'var(--border)', background: '#f8fafc' }}
            >
                <span style={{ color: 'var(--accent)' }}>{icon}</span>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {title}
                </p>
            </div>
            <div className="px-3.5 py-3 space-y-2 bg-white">
                {children}
            </div>
        </div>
    );
}

function DataRow({
    label,
    value,
    strong,
    mono,
}: {
    label: string;
    value: string;
    strong?: boolean;
    mono?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                {label}
            </span>
            <span
                className={`text-xs text-right truncate max-w-[240px] ${strong ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono tracking-wide' : ''}`}
                style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
                {value}
            </span>
        </div>
    );
}

function AmountRow({
    neto,
    iva,
    total,
}: {
    neto: number | null | undefined;
    iva: number | null | undefined;
    total: number | null | undefined;
}) {
    return (
        <div className="flex items-stretch gap-2">
            {/* Neto */}
            <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: '#f8fafc', border: '1px solid var(--border)' }}
            >
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    Neto
                </p>
                <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {neto != null ? formatCurrency(neto, 'ARS') : '—'}
                </p>
            </div>

            {/* IVA */}
            <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: '#f8fafc', border: '1px solid var(--border)' }}
            >
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    IVA
                </p>
                <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {iva != null ? formatCurrency(iva, 'ARS') : '—'}
                </p>
            </div>

            {/* Total — highlighted */}
            <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{
                    background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                    border: '1.5px solid #c7d2fe',
                }}
            >
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#6366f1' }}>
                    Total
                </p>
                <p className="text-[14px] font-extrabold" style={{ color: '#3730a3' }}>
                    {total != null ? formatCurrency(total, 'ARS') : '—'}
                </p>
            </div>
        </div>
    );
}

// ── ResultBanner ──────────────────────────────────────────────────────────────

function ResultBanner({
    output,
    fileName,
    onClose,
}: {
    output: ValidationOutput;
    fileName: string | null;
    onClose: () => void;
}) {
    const isApproved = output.apto_pago;
    const isInvalid  = output.estado_final === 'INVALIDO';

    const cfg = isApproved
        ? {
              gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              Icon: CheckCircle2,
              title: 'Apto para pago',
              sub: `Score ${output.score.total}/100 · Confianza alta`,
          }
        : isInvalid
        ? {
              gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
              Icon: XCircle,
              title: 'Rechazado',
              sub: 'Inconsistencia crítica detectada',
          }
        : {
              gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
              Icon: AlertTriangle,
              title: 'Requiere revisión',
              sub: `Score ${output.score.total}/100 · Revisar antes de pagar`,
          };

    const { gradient, Icon, title, sub } = cfg;

    return (
        <div
            className="flex items-center gap-4 px-5 py-5"
            style={{ background: gradient }}
        >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-snug">{title}</p>
                <p className="text-xs text-white/75 leading-snug">{sub}</p>
                {fileName && (
                    <p className="text-[11px] text-white/50 mt-0.5 truncate">{fileName}</p>
                )}
            </div>
            <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors flex-shrink-0"
            >
                <X className="h-3.5 w-3.5 text-white" />
            </button>
        </div>
    );
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<string, string> = {
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
    no_procesado: 'Sin datos',
};

const CONFIDENCE_COLORS: Record<string, { fill: string; badge: string }> = {
    alta:         { fill: '#10b981', badge: 'bg-emerald-50 text-emerald-700' },
    media:        { fill: '#f59e0b', badge: 'bg-amber-50 text-amber-700'     },
    baja:         { fill: '#f97316', badge: 'bg-orange-50 text-orange-700'   },
    no_procesado: { fill: '#94a3b8', badge: 'bg-slate-100 text-slate-500'    },
};

function ScoreBar({ score }: { score: ValidationScore }) {
    const c = CONFIDENCE_COLORS[score.confidence];

    const breakdown = [
        { label: 'QR',       pts: score.breakdown.qr_presence,     max: 20 },
        { label: 'Críticos', pts: score.breakdown.critical_fields,  max: 40 },
        { label: 'Montos',   pts: score.breakdown.amount_coherence, max: 20 },
        { label: 'Completo', pts: score.breakdown.completeness,     max: 20 },
    ];

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Score de validación
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                    {score.total}/100 · {CONFIDENCE_LABELS[score.confidence]}
                </span>
            </div>

            <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: '#e2e8f0' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${score.total}%` }}
                    transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
                    className="h-full rounded-full"
                    style={{ background: c.fill }}
                />
            </div>

            <div className="grid grid-cols-4 gap-1.5">
                {breakdown.map(({ label, pts, max }) => {
                    const ratio      = pts / max;
                    const cellBg     = ratio >= 1 ? '#f0fdf4' : ratio > 0 ? '#fffbeb' : '#fef2f2';
                    const cellColor  = ratio >= 1 ? '#166534' : ratio > 0 ? '#92400e' : '#991b1b';
                    const cellBorder = ratio >= 1 ? '#bbf7d0' : ratio > 0 ? '#fde68a' : '#fecaca';

                    return (
                        <div
                            key={label}
                            className="text-center rounded-lg py-2 px-1 border"
                            style={{ background: cellBg, borderColor: cellBorder }}
                        >
                            <p
                                className="text-[9px] font-bold uppercase tracking-wide mb-0.5"
                                style={{ color: cellColor, opacity: 0.65 }}
                            >
                                {label}
                            </p>
                            <p className="text-xs font-bold" style={{ color: cellColor }}>
                                {pts}
                                <span className="text-[9px] font-normal opacity-50">/{max}</span>
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── QR source badge ───────────────────────────────────────────────────────────

const QR_SOURCE_LABELS: Record<NonNullable<QrSource>, string> = {
    url:        'QR AFIP (URL)',
    barcode:    'Código de barras',
    image_scan: 'QR escaneado',
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
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            <QrCode className="h-2.5 w-2.5" />
            {QR_SOURCE_LABELS[source]}
        </span>
    );
}
