import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import './panel.css';
import DashboardPage from '../fashion-e-commerce-admin-development/src/app/page';

createRoot(document.getElementById('root')!).render(<React.StrictMode><DashboardPage/></React.StrictMode>);
