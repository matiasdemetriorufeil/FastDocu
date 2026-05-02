'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, AlertCircle, X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ValidationOutput } from '@/lib/ocr/types';

interface OcrTesterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function OcrTesterModal({ isOpen, onClose }: OcrTesterModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ValidationOutput | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setResult(null);
            setError(null);
        }
    };

    const processOCR = async () => {
        if (!file) return;

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/ocr', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Fallo el procesamiento OCR.');
            }

            setResult(data as ValidationOutput);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResult(null);
        setError(null);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
                        onClick={handleClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-2xl premium-shadow overflow-hidden z-50 flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <div className="bg-indigo-100 p-1.5 rounded-lg border border-indigo-200">
                                    <Sparkles className="h-5 w-5 text-indigo-600" />
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">Prueba OCR Inteligente (AFIP)</h3>
                            </div>
                            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {!result ? (
                                <div className="flex flex-col gap-6">
                                    {/* Upload Dropzone */}
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-indigo-400 transition-colors bg-slate-50/50 group">
                                        <UploadCloud className="h-10 w-10 text-slate-400 mb-4 group-hover:text-indigo-500 transition-colors" />
                                        <p className="text-sm font-bold text-slate-700 mb-1">
                                            {file ? file.name : "Subí un JPG, PNG o PDF"}
                                        </p>
                                        <p className="text-xs text-slate-500 mb-4">
                                            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Hasta 5MB para prueba rápida"}
                                        </p>
                                        <input
                                            type="file"
                                            id="ocr-file-upload"
                                            className="hidden"
                                            accept=".jpg,.jpeg,.png,.pdf"
                                            onChange={handleFileChange}
                                        />
                                        <label
                                            htmlFor="ocr-file-upload"
                                            className="px-4 py-2 font-bold text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors border border-indigo-200"
                                        >
                                            Seleccionar Archivo
                                        </label>
                                    </div>

                                    {error && (
                                        <div className="p-4 bg-red-50 text-red-700 text-sm font-bold rounded-lg border border-red-200">
                                            Error: {error}
                                        </div>
                                    )}

                                    <button
                                        onClick={processOCR}
                                        disabled={!file || loading}
                                        className="w-full py-3 rounded-xl text-white font-bold transition-all shadow-md mt-auto disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                                        style={{ background: 'linear-gradient(to right, var(--accent), #6366f1)' }}
                                    >
                                        {loading ? (
                                            <><Loader2 className="h-5 w-5 animate-spin" /> Analizando Documento (OCR + ML)...</>
                                        ) : (
                                            <><Sparkles className="h-5 w-5" /> Ejecutar Pipeline OCR</>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-5">
                                    <div className={cn("p-4 rounded-xl border flex items-center gap-3",
                                        (result.estado_final.includes('VALIDO') || result.estado_final === 'PROCESADO') ? "bg-emerald-50 border-emerald-200"
                                            : result.estado_final === 'NO_ENCONTRADO' ? "bg-yellow-50 border-yellow-200"
                                                : "bg-red-50 border-red-200"
                                    )}>
                                        {(result.estado_final.includes('VALIDO') || result.estado_final === 'PROCESADO') ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertCircle className="h-6 w-6 text-red-600" />}
                                        <div>
                                            <p className="font-bold text-slate-800">Resultado: {result.estado_final}</p>
                                            <p className="text-sm font-medium opacity-80">{result.detalle}</p>
                                        </div>
                                    </div>

                                    {/* Campos Extraídos */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            ['Tipo Factura', result.invoice?.tipo_factura],
                                            ['Nro. Factura', result.invoice?.numero_factura],
                                            ['Fecha Emisión', result.invoice?.fecha_emision],
                                            ['CUIT Emisor', result.invoice?.cuit_emisor],
                                            ['Razón Social Emisor', result.invoice?.razon_social_emisor],
                                            ['Condición IVA', result.invoice?.condicion_iva],
                                            ['CUIT Receptor', result.invoice?.cuit_receptor],
                                            ['Razón Social Receptor', result.invoice?.razon_social_receptor],
                                            ['Subtotal', result.invoice?.subtotal != null ? `$${result.invoice.subtotal.toLocaleString('es-AR')}` : null],
                                            ['IVA', result.invoice?.iva != null ? `$${result.invoice.iva.toLocaleString('es-AR')}` : null],
                                            ['Total', result.invoice?.total != null ? `$${result.invoice.total.toLocaleString('es-AR')}` : null],
                                            ['CAE', result.invoice?.cae],
                                            ['Vto. CAE', result.invoice?.fecha_vencimiento_cae],
                                            ['Domicilio', result.invoice?.domicilio_comercial],
                                        ].map(([label, val], i) => (
                                            <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{label as string}</p>
                                                <p className={cn("font-semibold text-sm truncate", val ? "text-slate-800" : "text-slate-400 italic")}>
                                                    {(val as string) || 'No detectado'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Warnings */}
                                    {result.warnings && result.warnings.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">⚠️ Advertencias</p>
                                            {result.warnings.map((w: string, i: number) => (
                                                <p key={i} className="text-xs text-amber-800">{w}</p>
                                            ))}
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">RAW JSON Output</p>
                                        <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs overflow-x-auto max-h-48">
                                            {JSON.stringify(result.invoice, null, 2)}
                                        </pre>
                                    </div>

                                    <button
                                        onClick={() => { setResult(null); setFile(null); }}
                                        className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-all mt-2"
                                    >
                                        Probar con otro documento
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
