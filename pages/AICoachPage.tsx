import React, { useState } from 'react';
import { generateTrainingDrill, analyzeFinancials } from '../services/geminiService';
import { Bot, Loader2, PlayCircle, TrendingUp } from 'lucide-react';

interface AICoachPageProps {
  income: number;
  expense: number;
}

export const AICoachPage: React.FC<AICoachPageProps> = ({ income, expense }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [activeTab, setActiveTab] = useState<'DRILL' | 'FINANCE'>('DRILL');
  
  const [ageGroup, setAgeGroup] = useState('Sub-11');
  const [skill, setSkill] = useState('Passe curto');
  const [duration, setDuration] = useState('60 minutos');

  const handleGenerateDrill = async () => {
    setLoading(true);
    setResult('');
    const response = await generateTrainingDrill(ageGroup, skill, duration);
    setResult(response);
    setLoading(false);
  };

  const handleAnalyzeFinance = async () => {
    setLoading(true);
    setResult('');
    const response = await analyzeFinancials(income, expense, 500);
    setResult(response);
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 rounded-2xl text-white shadow-lg">
            <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
                <div className="p-3 bg-white/10 rounded-full backdrop-blur-sm">
                    <Bot className="w-8 h-8 text-primary-500" />
                </div>
                <div className="text-center sm:text-left">
                    <h2 className="text-2xl font-bold">Assistente IA Gemini</h2>
                    <p className="text-gray-300">Inteligência artificial para auxiliar nos treinos e gestão.</p>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <button 
                    onClick={() => { setActiveTab('DRILL'); setResult(''); }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'DRILL' ? 'bg-primary-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                    <PlayCircle className="w-4 h-4 inline mr-2" /> Gerador de Treinos
                </button>
                <button 
                    onClick={() => { setActiveTab('FINANCE'); setResult(''); }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'FINANCE' ? 'bg-primary-600 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                    <TrendingUp className="w-4 h-4 inline mr-2" /> Analista Financeiro
                </button>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 min-h-[400px]">
            {activeTab === 'DRILL' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-800">Configurar Treino</h3>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Categoria</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50" value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
                                <option>Sub-7</option>
                                <option>Sub-9</option>
                                <option>Sub-11</option>
                                <option>Sub-13</option>
                                <option>Sub-15</option>
                                <option>Sub-17</option>
                                <option>Adulto</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Fundamento / Foco</label>
                            <input className="w-full border rounded-lg p-2.5 bg-gray-50" type="text" value={skill} onChange={e => setSkill(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">Duração</label>
                            <select className="w-full border rounded-lg p-2.5 bg-gray-50" value={duration} onChange={e => setDuration(e.target.value)}>
                                <option>45 minutos</option>
                                <option>60 minutos</option>
                                <option>90 minutos</option>
                                <option>120 minutos</option>
                            </select>
                        </div>
                        <button 
                            onClick={handleGenerateDrill}
                            disabled={loading}
                            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
                            Gerar Treino
                        </button>
                    </div>
                    <div className="md:col-span-2 bg-gray-50 rounded-xl p-6 border border-gray-100 overflow-y-auto max-h-[500px]">
                        {result ? (
                             <article className="prose prose-sm prose-orange max-w-none">
                                <pre className="whitespace-pre-wrap font-sans text-gray-700">{result}</pre>
                             </article>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Bot className="w-12 h-12 mb-2 opacity-20" />
                                <p>O resultado do planejamento aparecerá aqui.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                         <h3 className="font-bold text-gray-800">Análise Financeira Rápida</h3>
                         <button 
                            onClick={handleAnalyzeFinance}
                            disabled={loading}
                            className="py-2 px-6 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Solicitar Análise'}
                        </button>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-8 border border-gray-100 min-h-[200px]">
                         {result ? (
                             <p className="text-lg text-gray-800 leading-relaxed whitespace-pre-line">{result}</p>
                         ) : (
                             <p className="text-gray-400 text-center mt-12">Clique em solicitar análise para receber feedback da IA sobre suas finanças atuais.</p>
                         )}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};