'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import type { ValidationResult, ValidationIssue } from '@/types';
import { cn } from '@/lib/utils';

interface ValidationPanelProps {
    result: ValidationResult;
}

export default function ValidationPanel({ result }: ValidationPanelProps) {
    const hasIssues = result.errors.length > 0 || result.warnings.length > 0 || result.observations.length > 0;

    if (!hasIssues && result.aptoPago) {
        return (
            <div className="rounded-2xl border p-6 shadow-sm border-emerald-200 bg-emerald-50">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-emerald-800">Validación Completa Exitosa</h3>
                </div>
                <p className="text-sm font-medium text-emerald-700 leading-relaxed pl-[52px]">{result.decisionReason}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Errors */}
            {result.errors.length > 0 && (
                <div className="rounded-2xl border p-5 shadow-sm border-red-200 bg-red-50 text-red-900">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 border border-red-200 animate-pulse">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold">Inconsistencias Críticas</h3>
                            <p className="text-xs font-semibold text-red-700">{result.errors.length} problemas detectados</p>
                        </div>
                    </div>
                    <ul className="flex flex-col gap-3 pl-1">
                        {result.errors.map((error, idx) => (
                            <IssueItem key={idx} issue={error} color="red" />
                        ))}
                    </ul>
                </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
                <div className="rounded-2xl border p-5 shadow-sm border-orange-200 bg-orange-50 text-orange-900">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 border border-orange-200">
                            <AlertTriangle className="h-5 w-5 text-orange-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold">Advertencias</h3>
                            <p className="text-xs font-semibold text-orange-700">{result.warnings.length} puntos a revisar</p>
                        </div>
                    </div>
                    <ul className="flex flex-col gap-3 pl-1">
                        {result.warnings.map((warning, idx) => (
                            <IssueItem key={idx} issue={warning} color="orange" />
                        ))}
                    </ul>
                </div>
            )}

            {/* Observations */}
            {result.observations.length > 0 && (
                <div className="rounded-2xl border p-5 shadow-sm border-indigo-200 bg-indigo-50/50 text-indigo-900">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 border border-indigo-200">
                            <Info className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold">Observaciones Generales</h3>
                            <p className="text-xs font-semibold text-indigo-700">{result.observations.length} notas operativas</p>
                        </div>
                    </div>
                    <ul className="flex flex-col gap-3 pl-1">
                        {result.observations.map((obs, idx) => (
                            <li key={idx} className="flex gap-3 text-sm font-medium text-indigo-800">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500"></span>
                                <span>{obs}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function IssueItem({ issue, color }: { issue: ValidationIssue; color: 'red' | 'orange' }) {
    const isRed = color === 'red';
    return (
        <li className="flex items-start gap-3 rounded-lg bg-white/50 p-3 border border-white">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", isRed ? "bg-red-500" : "bg-orange-500")} />
            <div className="min-w-0">
                <span className={cn("text-xs font-black uppercase tracking-wider block mb-0.5", isRed ? "text-red-800" : "text-orange-800")}>
                    {issue.code}
                </span>
                <span className={cn("text-sm font-medium leading-relaxed block", isRed ? "text-red-950" : "text-orange-950")}>
                    {issue.message}
                </span>
            </div>
        </li>
    );
}
