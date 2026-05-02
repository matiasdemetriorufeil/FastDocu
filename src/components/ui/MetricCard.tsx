'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    delta?: number;
    deltaLabel?: string;
    index?: number;
}

export default function MetricCard({
    label,
    value,
    icon,
    color,
    bgColor,
    delta,
    deltaLabel,
    index = 0,
}: MetricCardProps) {
    const DeltaIcon =
        delta == null ? Minus : delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
    const deltaColor =
        delta == null ? 'var(--text-muted)' : delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-muted)';
    const deltaBgColor =
        delta == null ? '#f8fafc' : delta > 0 ? '#ecfdf5' : delta < 0 ? '#fef2f2' : '#f8fafc';

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }}
            className="group relative rounded-[20px] bg-white p-6 premium-shadow transition-all duration-300 hover:premium-shadow-hover hover:-translate-y-1 cursor-pointer border border-transparent hover:border-indigo-100"
        >
            <div className="flex items-start justify-between mb-6">
                <div
                    className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                    style={{ background: bgColor }}
                >
                    <span style={{ color }}>{icon}</span>
                </div>
                {delta != null && (
                    <div
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors"
                        style={{ color: deltaColor, background: deltaBgColor }}
                    >
                        <DeltaIcon className="h-3.5 w-3.5" strokeWidth={3} />
                        <span>{Math.abs(delta)}%</span>
                    </div>
                )}
            </div>
            <div>
                <h3 className="text-3xl font-extrabold tracking-tight mb-1 transition-colors group-hover:text-indigo-950" style={{ color: 'var(--text-primary)' }}>
                    {value}
                </h3>
                <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </p>
                <p className="text-sm font-medium mt-1.5 opacity-80" style={{ color: 'var(--text-muted)' }}>
                    {deltaLabel || 'Sin variación asignada'}
                </p>
            </div>
        </motion.div>
    );
}
