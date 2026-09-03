import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// v2.0.7+：桌面端玻璃化系统（cyan→magenta + backdrop-blur），与 web 端 glass.css 风格一致。
// styles.css 提供 baseline 颜色与字体，helper-glass.css 提供进阶视觉。
import './helper-glass.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
