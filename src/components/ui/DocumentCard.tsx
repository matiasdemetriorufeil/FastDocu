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
}

export default function DocumentCard({ document: doc, index = 0 }: DocumentCardProps) {
    const Icon = typeIconMap[doc.type];
    const fechaFormatted = formatDate(doc.fecha.split('T')[0]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3, ease: 'easeOut' }}
            className="group relative flex flex-col rounded-xl bg-white border transition-all duration-200 hover:-translate-y-[1px]"
            style={{ borderColor: 'var(--border)' }}
            onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)';
                el.style.borderColor = '#d1d5db';
            }}
            onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = '';
                el.style.borderColor = 'var(--border)';
            }}
        >
            {/* Body */}
            <div className="p-5 flex flex-col gap-4 flex-1">

                {/* Top: icon + identification + status badge */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <div
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-slate-100"
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

                {/* Info row: CUIT · Fecha · Total */}
                <div className="grid grid-cols-3 gap-3">
                    <InfoCol label="CUIT" value={doc.cuit || '—'} />
                    <InfoCol label="Fecha" value={fechaFormatted} />
                    <InfoCol
                        label="Total"
                        value={formatCurrency(doc.total, doc.moneda)}
                        strong
                    />
                </div>

                {/* OC badge (optional) */}
                {doc.ordenDeCompra && (
                    <div
                        className="rounded-lg px-3 py-2 text-xs font-medium border"
                        style={{
                            background: '#f0f9ff',
                            color: '#0369a1',
                            borderColor: '#bae6fd',
                        }}
                    >
                        OC:{' '}
                        <span className="font-semibold">{doc.ordenDeCompra}</span>
                    </div>
                )}
            </div>

            {/* Actions */}
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

                {doc.status !== 'aprobado' && (
                    <button
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
