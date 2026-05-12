'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    CheckCircle2,
    FileText,
    FileCheck,
    Receipt,
    FileMinus,
    FilePlus,
} from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatCurrency, formatDate } from '@/lib/validators';
import type { Document, DocumentType } from '@/types';

const typeIconMap: Record<DocumentType, React.ElementType> = {
    factura: FileText,
    comprobante: Receipt,
    orden_de_compra: FileCheck,
    nota_de_credito: FileMinus,
    nota_de_debito: FilePlus,
    recibo: Receipt,
};

const typeLabelMap: Record<DocumentType, string> = {
    factura: 'Factura',
    comprobante: 'Comprobante',
    orden_de_compra: 'O. de Compra',
    nota_de_credito: 'Nota de Crédito',
    nota_de_debito: 'Nota de Débito',
    recibo: 'Recibo',
};

interface DocumentCardProps {
    document: Document;
    index?: number;
    compact?: boolean;
    onApprove?: () => void;
}

export default function DocumentCard({ document: doc, index = 0, compact = false, onApprove }: DocumentCardProps) {
    const Icon = typeIconMap[doc.type];
    const fechaFormatted = formatDate(doc.fecha.split('T')[0]);

    if (compact) {
        return (
            <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04, duration: 0.28, ease: 'easeOut' }}
                className="group flex items-center gap-3 rounded-xl bg-white px-4 py-3 transition-all duration-150 cursor-pointer hover:-translate-y-px"
                style={{
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                    (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                }}
            >
                <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-indigo-50"
                    style={{ background: '#f3f4f6' }}
                >
                    <Icon className="h-[14px] w-[14px]" style={{ color: 'var(--text-muted)' }} />
                </div>

                <div className="flex-1 min-w-0">
                    <p
                        className="text-[14px] font-semibold truncate leading-snug"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {doc.proveedor}
                    </p>
                    <p className="text-[12px] leading-snug truncate" style={{ color: 'var(--text-muted)' }}>
                        {typeLabelMap[doc.type]}{doc.tipoLetra && ` ${doc.tipoLetra}`}
                        <span className="mx-1 opacity-40">·</span>
                        {doc.puntoVenta}-{doc.numeroComprobante}
                        <span className="mx-1 opacity-40">·</span>
                        {fechaFormatted}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <span
                        className="text-[14px] font-bold"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {formatCurrency(doc.total, doc.moneda)}
                    </span>
                    <StatusBadge status={doc.status} size="sm" />
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3, ease: 'easeOut' }}
            className="group relative flex flex-col rounded-2xl bg-white transition-all duration-200 hover:-translate-y-px"
            style={{
                border: '1px solid var(--border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0,0,0,0.07)';
                (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            }}
        >
            <div className="p-5 flex flex-col gap-4 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-indigo-50"
                            style={{ background: '#f3f4f6' }}
                        >
                            <Icon
                                className="h-[17px] w-[17px]"
                                style={{ color: 'var(--text-muted)' }}
                            />
                        </div>
                        <div className="min-w-0 pt-0.5">
                            <p
                                className="text-[11px] font-medium mb-0.5 truncate"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                {typeLabelMap[doc.type]}
                                {doc.tipoLetra && (
                                    <span className="ml-1 font-bold">{doc.tipoLetra}</span>
                                )}
                                <span className="mx-1.5 opacity-40">·</span>
                                {doc.puntoVenta}-{doc.numeroComprobante}
                            </p>
                            <p
                                className="text-[13px] font-semibold leading-snug truncate"
                                style={{ color: 'var(--text-primary)', maxWidth: '200px' }}
                            >
                                {doc.proveedor}
                            </p>
                        </div>
                    </div>
                    <StatusBadge status={doc.status} size="sm" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <InfoCol label="CUIT" value={doc.cuit || '—'} />
                    <InfoCol label="Fecha" value={fechaFormatted} />
                    <InfoCol label="Total" value={formatCurrency(doc.total, doc.moneda)} strong />
                </div>

                {doc.ordenDeCompra && (
                    <div
                        className="rounded-lg px-3 py-2 text-xs font-medium"
                        style={{
                            background: '#f0f9ff',
                            color: '#0369a1',
                            border: '1px solid #bae6fd',
                        }}
                    >
                        OC: <span className="font-semibold">{doc.ordenDeCompra}</span>
                    </div>
                )}
            </div>

            <div
                className="flex items-center gap-2 px-5 py-3 border-t"
                style={{ borderColor: 'var(--border-soft)' }}
            >
                <Link href={`/documents/${encodeURIComponent(doc.id)}`} className="flex-1">
                    <button
                        className="w-full rounded-lg py-2 text-[13px] font-medium text-center transition-colors hover:bg-slate-50"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Ver detalle
                    </button>
                </Link>

                {doc.status !== 'aprobado' && onApprove && (
                    <button
                        onClick={onApprove}
                        className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors"
                        style={{ background: 'var(--accent)' }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.background = 'var(--accent-hover)')
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.background = 'var(--accent)')
                        }
                    >
                        <CheckCircle2 className="h-[14px] w-[14px]" />
                        Aprobar
                    </button>
                )}
            </div>
        </motion.div>
    );
}

function InfoCol({
    label,
    value,
    strong = false,
}: {
    label: string;
    value: string;
    strong?: boolean;
}) {
    return (
        <div>
            <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
            >
                {label}
            </p>
            <p
                className={strong ? 'text-[13px] font-bold' : 'text-[13px] font-medium'}
                style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
                {value}
            </p>
        </div>
    );
}
