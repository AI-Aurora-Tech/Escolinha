
import { GoogleGenAI } from "@google/genai";

// Guideline: The API key must be obtained exclusively from the environment variable process.env.API_KEY.
// Guideline: Use this process.env.API_KEY string directly when initializing.

export const generateTrainingDrill = async (ageGroup: string, focusSkill: string, duration: string): Promise<string> => {
  try {
    // Guideline: Initialize inside the function safely using process.env.API_KEY.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Guideline: Use gemini-3-flash-preview for basic text tasks.
    const model = 'gemini-3-flash-preview';
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

    // Guideline: Use response.text directly (not a method).
    return response.text || "Não foi possível gerar o treino no momento.";
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    return "Erro ao conectar com a Inteligência Artificial. Verifique sua chave de API.";
  }
};

export const analyzeRetention = async (inactiveStudentsData: string): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const model = 'gemini-3.1-pro-preview';
        const prompt = `
          Você é um especialista em retenção de alunos e gestão esportiva.
          Abaixo está uma lista de alunos inativos da escolinha de futebol "Garotos do Martinica" e os motivos relatados para a inativação.
          
          Dados dos alunos inativos:
          ${inactiveStudentsData}
          
          Por favor, faça uma análise semanal desses motivos e forneça:
          1. Um resumo dos principais motivos de saída.
          2. Alternativas e estratégias práticas para reverter esses alunos (trazê-los de volta).
          3. Sugestões de melhorias para a escolinha evitar futuras evasões.
          
          Responda em formato Markdown, de forma clara, profissional e encorajadora.
        `;
    
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
    
        return response.text || "Análise indisponível.";
      } catch (error) {
        console.error("Erro ao chamar Gemini:", error);
        return "Erro ao processar análise de retenção.";
      }
}

export const analyzeFinancials = async (income: number, expense: number, latePayments: number): Promise<string> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Fix: Use gemini-3-pro-preview for complex reasoning and math tasks like financial analysis.
        const model = 'gemini-3-pro-preview';
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
