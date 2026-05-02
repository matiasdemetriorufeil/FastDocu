'use client';

import { motion } from 'framer-motion';
import {
    ShieldCheck,
    Calculator,
    Copy,
    QrCode,
    BadgeCheck,
    GitMerge,
    ArrowRight,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Capability, CapabilityStatus } from '@/types';

const iconMap: Record<string, React.ElementType> = {
    ShieldCheck,
    Calculator,
    Copy,
    QrCode,
    BadgeCheck,
    GitMerge,
};

const statusConfig: Record<CapabilityStatus, { label: string; bg: string; color: string; border: string }> = {
    activo: { label: 'Activo', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
    beta: { label: 'Beta', bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' },
    proximo: { label: 'En desarrollo', bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
};

interface CapabilityCardProps {
    capability: Capability;
    index?: number;
}

export default function CapabilityCard({ capability, index = 0 }: CapabilityCardProps) {
    const Icon = iconMap[capability.icon] ?? ShieldCheck;
    const status = statusConfig[capability.status];
    const isActive = capability.status === 'activo' || capability.status === 'beta';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05, duration: 0.4, ease: 'easeOut' }}
            className={cn(
                'group relative rounded-2xl p-6 transition-all duration-300 border',
                isActive ? 'bg-white premium-shadow hover:premium-shadow-hover hover:-translate-y-1 cursor-pointer' : 'bg-slate-50/50 grayscale-[20%]'
            )}
            style={{ borderColor: isActive ? 'var(--border)' : 'var(--border-soft)' }}
        >
            {/* Glow effect on hover */}
            {isActive && (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
            )}

            {/* Status chip */}
            <span
                className="absolute top-5 right-5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border"
                style={{ background: status.bg, color: status.color, borderColor: status.border }}
            >
                {status.label}
            </span>

            {/* Icon */}
            <div
                className={cn(
                    "mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] transition-transform duration-300 group-hover:scale-110",
                    isActive ? "bg-indigo-50 border border-indigo-100" : "bg-slate-100 border border-slate-200"
                )}
            >
                <Icon
                    className="h-6 w-6"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
                />
            </div>

            <h3
                className="font-bold text-lg mb-2"
                style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
                {capability.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {capability.description}
            </p>

            {isActive && (
                <div className="mt-5 flex items-center gap-1.5 text-sm font-bold opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300" style={{ color: 'var(--accent)' }}>
                    <Sparkles className="h-4 w-4" />
                    <span>Configurar módulo</span>
                    <ArrowRight className="h-4 w-4 ml-0.5" />
                </div>
            )}
        </motion.div>
    );
}
