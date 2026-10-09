import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import AdultOpdApp from '../AdultOpdApp';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdultOpdApp />
    </BrowserRouter>
  </React.StrictMode>
);
