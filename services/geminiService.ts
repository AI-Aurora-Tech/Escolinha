import { GoogleGenAI } from "@google/genai";

// Helper to access env vars safely in Vite/Browser
const getApiKey = () => {
  // 1. Try import.meta.env (Vite Standard)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  
  // 2. Try process.env safely (Node/Webpack fallback)
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore ReferenceError if process is not defined
  }
  
  return '';
};

// Remove top-level initialization to prevent crash
// const ai = new GoogleGenAI({ apiKey }); <--- CAUSES CRASH

export const generateTrainingDrill = async (ageGroup: string, focusSkill: string, duration: string): Promise<string> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return "Chave da API não configurada (VITE_GEMINI_API_KEY).";

    // Initialize inside the function safely
    const ai = new GoogleGenAI({ apiKey });

    const model = 'gemini-2.5-flash';
    const prompt = `
      Você é um técnico de futebol profissional da escolinha "Garotos do Martinica".
      Crie um plano de treino detalhado.
      
      Público Alvo: ${ageGroup}
      Foco do Treino: ${focusSkill}
      Duração Total: ${duration}
      
      Estrutura da resposta (use Markdown):
      1. Aquecimento (com tempo)
      2. Atividade Principal (Drills específicos, explique o passo a passo)
      3. Coletivo ou Jogo Reduzido
      4. Volta à calma
      
      Seja motivador e técnico.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Não foi possível gerar o treino no momento.";
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    return "Erro ao conectar com a Inteligência Artificial. Verifique sua chave de API.";
  }
};

export const analyzeFinancials = async (income: number, expense: number, latePayments: number): Promise<string> => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) return "Chave da API não configurada (VITE_GEMINI_API_KEY).";

        // Initialize inside the function safely
        const ai = new GoogleGenAI({ apiKey });

        const model = 'gemini-2.5-flash';
        const prompt = `
          Analise a saúde financeira da escolinha de futebol "Garotos do Martinica".
          Dados do mês atual:
          - Receitas (Mensalidades): R$ ${income.toFixed(2)}
          - Despesas (Contas): R$ ${expense.toFixed(2)}
          - Mensalidades Atrasadas (Inadimplência estimada): R$ ${latePayments.toFixed(2)}
    
          Forneça um feedback curto (max 100 palavras) sobre a situação e uma sugestão de ação para o administrador.
        `;
    
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
    
        return response.text || "Análise indisponível.";
      } catch (error) {
        console.error("Erro ao chamar Gemini:", error);
        return "Erro ao processar análise financeira.";
      }
}