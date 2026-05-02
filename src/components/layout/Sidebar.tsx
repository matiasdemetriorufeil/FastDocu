'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Inbox,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Archive,
    Settings,
    Sparkles,
    FileCheck2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { label: 'Inbox', href: '/inbox', icon: Inbox, badge: 4 },
    { label: 'Pendientes', href: '/documents?status=pendiente', icon: Clock, badge: 3 },
    { label: 'Aprobados', href: '/documents?status=aprobado', icon: CheckCircle2 },
    { label: 'A Revisar', href: '/documents?status=revisar', icon: AlertTriangle, badge: 2 },
    { label: 'Archivados', href: '/documents?status=archivado', icon: Archive },
    { label: 'Configuración', href: '/settings', icon: Settings },
];

const SIDEBAR_BG = '#0f172a';
const SIDEBAR_BORDER = 'rgba(255,255,255,0.06)';

export default function Sidebar() {
    const pathname = usePathname();

    const isActive = (href: string) => {
        const base = href.split('?')[0];
        return pathname === base || (base !== '/' && pathname.startsWith(base));
    };

    return (
        <aside
            className="flex h-full w-[248px] flex-shrink-0 flex-col z-20"
            style={{ background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BORDER}` }}
        >
            {/* Logo */}
            <div
                className="flex items-center gap-3 px-5 py-[18px] border-b"
                style={{ borderColor: SIDEBAR_BORDER }}
            >
                <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ background: 'var(--accent)' }}
                >
                    <FileCheck2 className="h-4 w-4 text-white" />
                </div>
                <div>
                    <p className="text-white font-semibold text-[15px] tracking-tight leading-none mb-0.5">
                        FastDocu
                    </p>
                    <p
                        className="text-[10px] font-medium uppercase tracking-widest leading-none"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                        Enterprise
                    </p>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1 overflow-y-auto">
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link key={item.href} href={item.href}>
                            <motion.div
                                whileHover={{ x: 2 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className={cn(
                                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors',
                                    active ? '' : 'hover:bg-white/[0.04]'
                                )}
                                style={{
                                    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                                    color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)',
                                }}
                            >
                                {/* Left active indicator */}
                                {active && (
                                    <div
                                        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
                                        style={{ background: 'var(--accent)' }}
                                    />
                                )}

                                <item.icon
                                    className={cn(
                                        'h-4 w-4 flex-shrink-0 transition-colors',
                                        active
                                            ? 'text-indigo-400'
                                            : 'text-white/30 group-hover:text-white/55'
                                    )}
                                />
                                <span className="flex-1 truncate">{item.label}</span>

                                {item.badge && (
                                    <span
                                        className="flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1 text-[10px] font-bold"
                                        style={{
                                            background: active
                                                ? 'rgba(99,102,241,0.3)'
                                                : 'rgba(255,255,255,0.06)',
                                            color: active
                                                ? '#a5b4fc'
                                                : 'rgba(255,255,255,0.35)',
                                        }}
                                    >
                                        {item.badge}
                                    </span>
                                )}
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom section */}
            <div
                className="px-3 pb-4 pt-3 border-t"
                style={{ borderColor: SIDEBAR_BORDER }}
            >
                {/* AI Copilot */}
                <div
                    className="rounded-xl px-4 py-4 mb-3 cursor-pointer"
                    style={{
                        background: 'rgba(79,70,229,0.1)',
                        border: '1px solid rgba(99,102,241,0.18)',
                    }}
                >
                    <div className="flex items-center gap-2 mb-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="text-sm font-semibold text-white">IA Copilot</span>
                    </div>
                    <p
                        className="text-xs leading-relaxed mb-3"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                        Conciliación automática con inteligencia artificial.
                    </p>
                    <button
                        className="w-full rounded-lg py-1.5 text-xs font-semibold transition-colors"
                        style={{
                            border: '1px solid rgba(99,102,241,0.3)',
                            color: 'rgba(165,180,252,0.9)',
                            background: 'transparent',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.12)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        Saber más
                    </button>
                </div>

                {/* User card */}
                <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0 relative"
                        style={{ background: '#3451b2' }}
                    >
                        LM
                        <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-400 rounded-full border-2"
                            style={{ borderColor: SIDEBAR_BG }}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate leading-snug">
                            Laura Méndez
                        </p>
                        <p
                            className="text-[11px] leading-snug truncate"
                            style={{ color: 'rgba(255,255,255,0.32)' }}
                        >
                            Administradora
                        </p>
                    </div>
                    <Settings
                        className="h-3.5 w-3.5 flex-shrink-0 opacity-30"
                        style={{ color: 'white' }}
                    />
                </div>
            </div>
        </aside>
    );
}
