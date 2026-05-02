'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FileCheck2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate login delay
        setTimeout(() => {
            router.push('/inbox');
        }, 1000);
    };

    return (
        <div className="flex min-h-screen bg-slate-50">
            {/* Left side: branding/value prop */}
            <div
                className="hidden w-1/2 flex-col justify-between p-12 lg:flex relative overflow-hidden"
                style={{ background: 'var(--navy-950)' }}
            >
                {/* Subtle background decoration */}
                <div
                    className="absolute -top-1/2 -left-1/2 h-full w-full opacity-10 blur-3xl rounded-full"
                    style={{ background: 'linear-gradient(to right, #3b82f6, #6366f1)', transform: 'scale(2)' }}
                />

                <div className="relative z-10 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
                        <FileCheck2 className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">FastDocu</span>
                </div>

                <div className="relative z-10 max-w-md">
                    <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
                        Validación y conciliación documental inteligente.
                    </h1>
                    <p className="text-lg text-slate-300 leading-relaxed">
                        Ahorrá tiempo automatizando la revisión de facturas, CUITs, IVA, comprobantes y órdenes de compra de forma precisa y trazable.
                    </p>
                </div>

                <div className="relative z-10">
                    <p className="text-sm font-medium text-slate-400">© 2026 FastDocu — Versión Enterprise</p>
                </div>
            </div>

            {/* Right side: Login form */}
            <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-24">
                <div className="mx-auto w-full max-w-sm">
                    <div className="mb-10 lg:hidden flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
                            <FileCheck2 className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-slate-900">FastDocu</span>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Iniciar sesión</h2>
                        <p className="text-sm text-slate-500">Ingresá tus credenciales para acceder a tu área de trabajo.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">
                                Correo corporativo
                            </label>
                            <input
                                id="email"
                                type="email"
                                placeholder="nombre@empresa.com.ar"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
                                    Contraseña
                                </label>
                                <a href="#" className="text-xs font-medium text-blue-600 hover:underline">
                                    ¿Olvidaste tu contraseña?
                                </a>
                            </div>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm transition-shadow focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                            />
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            type="submit"
                            disabled={isLoading}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 disabled:opacity-70"
                        >
                            {isLoading ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                                <>
                                    Ingresar a mi cuenta
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </motion.button>
                    </form>
                </div>
            </div>
        </div>
    );
}
