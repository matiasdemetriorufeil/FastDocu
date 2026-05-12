'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
    index = 0,
}: MetricCardProps) {
    const deltaPositive = delta != null && delta > 0;
    const deltaNegative = delta != null && delta < 0;
    const DeltaIcon = deltaPositive ? TrendingUp : TrendingDown;
    const deltaColor = deltaPositive ? '#10b981' : deltaNegative ? '#ef4444' : 'var(--text-muted)';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="rounded-xl bg-white p-5 transition-all duration-200 hover:-translate-y-px"
            style={{
                border: '1px solid var(--border)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)';
                (e.currentTarget as HTMLElement).style.borderColor = '#c7d2fe';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            }}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div
                        className="flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0"
                        style={{ background: bgColor }}
                    >
                        <span style={{ color, display: 'flex' }}>{icon}</span>
                    </div>
                    <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {label}
                    </span>
                </div>
                {delta != null && (
                    <span
                        className="flex items-center gap-0.5 text-[12px] font-semibold"
                        style={{ color: deltaColor }}
                    >
                        <DeltaIcon className="h-3 w-3" strokeWidth={2.5} />
                        {Math.abs(delta)}%
                    </span>
                )}
            </div>
            <p
                className="text-[30px] font-bold tracking-tight leading-none"
                style={{ color: 'var(--text-primary)' }}
            >
                {value}
            </p>
        </motion.div>
    );
}
