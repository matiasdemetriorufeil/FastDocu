'use client';

import { motion } from 'framer-motion';
import {
    ShieldCheck,
    Calculator,
    Copy,
    QrCode,
    BadgeCheck,
    GitMerge,
} from 'lucide-react';
import type { Capability, CapabilityStatus } from '@/types';

const iconMap: Record<string, React.ElementType> = {
    ShieldCheck,
    Calculator,
    Copy,
    QrCode,
    BadgeCheck,
    GitMerge,
};

const statusConfig: Record<CapabilityStatus, { label: string; bg: string; color: string }> = {
    activo:  { label: 'Activo',  bg: '#f0fdf4', color: '#15803d' },
    beta:    { label: 'Beta',    bg: '#eef2ff', color: '#4f46e5' },
    proximo: { label: 'Próximo', bg: '#f8fafc', color: '#94a3b8' },
};

interface CapabilityCardProps {
    capability: Capability;
    index?: number;
}

export default function CapabilityCard({ capability, index = 0 }: CapabilityCardProps) {
    const Icon = iconMap[capability.icon] ?? ShieldCheck;
    const status = statusConfig[capability.status];
    const isActive = capability.status !== 'proximo';

    return (
        <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.04, duration: 0.28, ease: 'easeOut' }}
            className={`flex items-center gap-4 rounded-xl px-5 py-4 transition-all duration-150 ${
                isActive ? 'bg-white hover:-translate-y-px' : 'bg-[#fafafa]'
            }`}
            style={{
                border: `1px solid ${isActive ? 'var(--border)' : '#f1f3f5'}`,
                boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.03)' : 'none',
            }}
            onMouseEnter={isActive ? (e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.07)';
                (e.currentTarget as HTMLElement).style.borderColor = '#e0e7ff';
            } : undefined}
            onMouseLeave={isActive ? (e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            } : undefined}
        >
            <div
                className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                style={{ background: isActive ? '#eef2ff' : '#f1f3f5' }}
            >
                <Icon
                    className="h-5 w-5"
                    style={{ color: isActive ? 'var(--accent)' : '#d1d5db' }}
                />
            </div>

            <div className="flex-1 min-w-0">
                <p
                    className="text-[15px] font-semibold leading-snug truncate"
                    style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                    {capability.title}
                </p>
                <p
                    className="text-[13px] leading-snug truncate mt-0.5"
                    style={{ color: isActive ? 'var(--text-secondary)' : '#cbd5e1' }}
                >
                    {capability.description}
                </p>
            </div>

            <span
                className="text-[12px] font-semibold rounded-full px-3 py-1 flex-shrink-0"
                style={{ background: status.bg, color: status.color }}
            >
                {status.label}
            </span>
        </motion.div>
    );
}
