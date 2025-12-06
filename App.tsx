import React from 'react';
import { SurveyProvider } from './context/SurveyContext';
import { Canvas } from './components/Canvas';
import { Controls } from './components/Controls';

const App = () => {
  return (
    <SurveyProvider>
      <div className="relative w-full h-full overflow-hidden bg-slate-900">
        <Canvas />
        <Controls />
      </div>
    </SurveyProvider>
  );
};

export default App;
