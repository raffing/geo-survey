import React, { useState, useEffect, useRef } from 'react';
import { useSurvey } from '../context/SurveyContext';
import { GoogleGenAI } from "@google/genai";
import { Send, X, Bot, User, Sparkles, Loader2, RefreshCw } from 'lucide-react';

interface Message {
    role: 'user' | 'model';
    text: string;
}

export const AiAssistant: React.FC = () => {
    const { state, dispatch } = useSurvey();
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: 'Hello! I am your AI Surveyor assistant. I can help you analyze your geometry, suggest triangulation strategies, or explain how to use the tools. What can I do for you?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, state.isAiPanelOpen]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userText = input.trim();
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setInput('');
        setIsLoading(true);

        try {
            // Simplify state for context
            const contextData = state.polygons.map(p => ({
                name: p.name,
                vertices: p.vertices.length,
                solved: p.isLocked,
                edges: p.edges.length,
                area: p.area,
                hasErrors: !p.isLocked,
                metricError: p.metricError
            }));

            const systemPrompt = `
You are an expert surveyor assistant for the GeoSurvey Pro application.
The app allows users to sketch floor plans and uses triangulation to solve geometry based on real-world measurements.

Context:
- Users draw polygons.
- They measure edge lengths (walls) and diagonals.
- If enough lengths are provided (triangulation), the shape becomes "Solved" (Locked) and Area is calculated.
- If not solved, vertices are red/movable. If solved, they are locked.

Current Survey State:
${JSON.stringify(contextData, null, 2)}

User Question: ${userText}

Answer briefly and helpfully. If the user has unsolved polygons, suggest adding diagonals to triangulate.
            `;

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: systemPrompt,
            });

            const text = response.text || "I couldn't generate a response.";
            setMessages(prev => [...prev, { role: 'model', text }]);

        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error connecting to the AI service." }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!state.isAiPanelOpen) return null;

    return (
        <div className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold">
                    <Sparkles size={20} />
                    <span>AI Surveyor</span>
                </div>
                <button 
                    onClick={() => dispatch({ type: 'TOGGLE_AI_PANEL', payload: undefined })}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full"
                >
                    <X size={20} className="text-slate-500" />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-300' : 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300'}`}>
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                        </div>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                     <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300 flex items-center justify-center shrink-0">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin text-purple-500" />
                            <span className="text-xs text-slate-500 font-medium">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about your survey..."
                        disabled={isLoading}
                        className="w-full bg-slate-100 dark:bg-slate-800 border-0 rounded-full px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 dark:text-slate-100"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="absolute right-1.5 p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white rounded-full transition-colors"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
                <div className="text-[10px] text-center text-slate-400 mt-2">
                    AI can make mistakes. Review generated insights.
                </div>
            </div>
        </div>
    );
};