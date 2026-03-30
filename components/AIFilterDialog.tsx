import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

interface AIFilterDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyFilters: (filters: any) => void;
    contextData: string;
    schemaProperties: any;
    title?: string;
    placeholder?: string;
}

export function AIFilterDialog({ 
    isOpen, 
    onClose, 
    onApplyFilters, 
    contextData, 
    schemaProperties,
    title = 'Filtro Inteligente',
    placeholder = 'Ex: Mostre apenas os alunos inadimplentes do grupo Sub-11'
}: AIFilterDialogProps) {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleApply = async () => {
        if (!prompt.trim()) return;
        
        setIsLoading(true);
        setError('');

        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error('Chave da API do Gemini não configurada.');
            }

            const ai = new GoogleGenAI({ apiKey });

            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: `Você é um assistente de filtragem de dados.
O usuário quer filtrar uma lista.
Aqui estão os dados de contexto (opções disponíveis):
${contextData}

O usuário pediu: "${prompt}"

Retorne um JSON com os filtros aplicados. Se o usuário não mencionar um filtro, use o valor padrão (geralmente 'ALL' ou array vazio, conforme o contexto).`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: schemaProperties,
                    },
                    temperature: 0.1,
                },
            });

            const jsonStr = response.text?.trim();
            if (jsonStr) {
                const filters = JSON.parse(jsonStr);
                onApplyFilters(filters);
                onClose();
            } else {
                throw new Error('Resposta vazia da IA.');
            }
        } catch (err: any) {
            console.error('Erro na IA:', err);
            setError(err.message || 'Ocorreu um erro ao processar sua solicitação.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="bg-gradient-to-r from-primary-600 to-primary-800 p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        Descreva como você quer filtrar os dados e a inteligência artificial fará o trabalho para você.
                    </p>
                    
                    <textarea
                        className="w-full border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-primary-500 outline-none resize-none min-h-[120px] text-sm"
                        placeholder={placeholder}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isLoading}
                        autoFocus
                    />

                    {error && (
                        <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
                        disabled={isLoading}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={isLoading || !prompt.trim()}
                        className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Filtrar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
