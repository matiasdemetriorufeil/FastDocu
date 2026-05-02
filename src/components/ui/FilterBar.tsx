'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentFilters, DocumentStatus } from '@/types';

const statusOptions: {
    value: DocumentStatus | 'todos';
    label: string;
    dot?: string;
}[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'aprobado', label: 'Aprobados', dot: '#16a34a' },
    { value: 'pendiente', label: 'Pendientes', dot: '#ca8a04' },
    { value: 'revisar', label: 'A Revisar', dot: '#ea580c' },
    { value: 'observado', label: 'Críticos', dot: '#ef4444' },
    { value: 'duplicado', label: 'Duplicados', dot: '#8b5cf6' },
];

interface FilterBarProps {
    filters: DocumentFilters;
    onFilterChange: <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => void;
    onReset: () => void;
    total: number;
    filtered: number;
}

export default function FilterBar({
    filters,
    onFilterChange,
    onReset,
    total,
    filtered,
}: FilterBarProps) {
    const [showDates, setShowDates] = useState(false);
    const hasActiveFilters =
        filters.status !== 'todos' || filters.type !== 'todos' || filters.dateFrom || filters.dateTo;
    const hasDateFilters = !!(filters.dateFrom || filters.dateTo);

    return (
        <div className="flex flex-col gap-2.5">
            {/* Primary row */}
            <div className="flex items-center gap-3">
                {/* Status tabs */}
                <div
                    className="flex items-center gap-0.5 p-1 rounded-xl border"
                    style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                    {statusOptions.map((opt) => {
                        const isActive = filters.status === opt.value;
                        return (
                            <button
                                key={opt.value}
                                onClick={() => onFilterChange('status', opt.value)}
                                className={cn(
                                    'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-all whitespace-nowrap',
                                    isActive
                                        ? 'font-semibold bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                                        : 'font-medium hover:bg-white/60'
                                )}
                                style={{
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                }}
                            >
                                {opt.dot && (
                                    <span
                                        className="h-[5px] w-[5px] rounded-full flex-shrink-0"
                                        style={{
                                            background: opt.dot,
                                            opacity: isActive ? 1 : 0.45,
                                        }}
                                    />
                                )}
                                {opt.label}
                            </button>
                        );
                    })}
                </div>

                {/* Right side controls */}
                <div className="flex items-center gap-2 ml-auto">
                    {/* Date filter toggle */}
                    <button
                        onClick={() => setShowDates(!showDates)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[13px] font-medium border transition-colors',
                            showDates || hasDateFilters
                                ? 'text-indigo-700 bg-indigo-50'
                                : 'hover:bg-slate-50'
                        )}
                        style={{
                            borderColor: showDates || hasDateFilters ? '#c7d2fe' : 'var(--border)',
                            color: showDates || hasDateFilters ? undefined : 'var(--text-secondary)',
                            background: (!showDates && !hasDateFilters) ? 'white' : undefined,
                        }}
                    >
                        <Calendar className="h-[14px] w-[14px]" />
                        Fechas
                        {hasDateFilters && (
                            <span className="h-[5px] w-[5px] rounded-full bg-indigo-500" />
                        )}
                    </button>

                    {/* Reset */}
                    <AnimatePresence>
                        {hasActiveFilters && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.92 }}
                                onClick={onReset}
                                className="flex items-center gap-1.5 rounded-lg border px-3 py-[7px] text-[13px] font-medium transition-colors hover:bg-slate-50 bg-white"
                                style={{
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <X className="h-[14px] w-[14px]" />
                                Limpiar
                            </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Count */}
                    <div className="flex items-baseline gap-1 pl-2">
                        <span
                            className="text-[17px] font-bold leading-none"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {filtered}
                        </span>
                        <span
                            className="text-[11px] font-medium"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            {filtered === 1 ? 'doc' : 'docs'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Date pickers — toggled */}
            <AnimatePresence>
                {showDates && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                    >
                        <div
                            className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-white"
                            style={{ borderColor: 'var(--border)' }}
                        >
                            <span
                                className="text-xs font-medium"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                Desde
                            </span>
                            <input
                                type="date"
                                value={filters.dateFrom ?? ''}
                                onChange={(e) =>
                                    onFilterChange('dateFrom', e.target.value || undefined)
                                }
                                className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
                                style={{
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-surface)',
                                }}
                            />
                            <span
                                className="text-xs font-medium"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                hasta
                            </span>
                            <input
                                type="date"
                                value={filters.dateTo ?? ''}
                                onChange={(e) =>
                                    onFilterChange('dateTo', e.target.value || undefined)
                                }
                                className="rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors"
                                style={{
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-surface)',
                                }}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
