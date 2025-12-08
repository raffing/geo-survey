import React from 'react';
import { SurveyProvider, useSurvey } from './context/SurveyContext';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';

const ThemedLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { state } = useSurvey();
    return (
        <div className={`relative w-full h-full overflow-hidden transition-colors duration-300 ${state.theme === 'dark' ? 'dark bg-slate-900' : 'bg-slate-50'}`}>
            {children}
        </div>
    );
}

const App = () => {
  return (
    <SurveyProvider>
      <ThemedLayout>
        <Canvas />
        <Controls />
      </ThemedLayout>
    </SurveyProvider>
  );
};

export default App;