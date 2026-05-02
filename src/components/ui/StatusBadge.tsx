import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/types';

const statusConfig: Record<
    DocumentStatus,
    { label: string; bg: string; text: string; dot: string; border: string }
> = {
    aprobado: {
        label: 'Aprobado',
        bg: '#f0fdf4',
        text: '#15803d',
        dot: '#16a34a',
        border: '#bbf7d0',
    },
    pendiente: {
        label: 'Pendiente',
        bg: '#fefce8',
        text: '#a16207',
        dot: '#ca8a04',
        border: '#fde68a',
    },
    revisar: {
        label: 'A Revisar',
        bg: '#fff7ed',
        text: '#c2410c',
        dot: '#ea580c',
        border: '#fed7aa',
    },
    duplicado: {
        label: 'Duplicado',
        bg: '#f5f3ff',
        text: '#6d28d9',
        dot: '#8b5cf6',
        border: '#ddd6fe',
    },
    observado: {
        label: 'Crítico',
        bg: '#fef2f2',
        text: '#b91c1c',
        dot: '#ef4444',
        border: '#fecaca',
    },
};

interface StatusBadgeProps {
    status: DocumentStatus;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    outline?: boolean;
}

export default function StatusBadge({ status, size = 'md', className, outline = false }: StatusBadgeProps) {
    const config = statusConfig[status];

    const sizeStyles = {
        sm: 'px-2 py-[3px] text-[10px] gap-1.5',
        md: 'px-2.5 py-1 text-[11px] gap-1.5',
        lg: 'px-3 py-1.5 text-xs gap-2',
    };

    const dotSizes = {
        sm: 'h-[5px] w-[5px]',
        md: 'h-[6px] w-[6px]',
        lg: 'h-[7px] w-[7px]',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full font-semibold border',
                sizeStyles[size],
                className,
            )}
            style={{
                background: outline ? 'transparent' : config.bg,
                color: config.text,
                borderColor: config.border,
            }}
        >
            <span
                className={cn('rounded-full flex-shrink-0', dotSizes[size])}
                style={{ background: config.dot }}
            />
            {config.label}
        </span>
    );
}
