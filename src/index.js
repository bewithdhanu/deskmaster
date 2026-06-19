import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initCapacitorShell } from './capacitor-init';

initCapacitorShell();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
