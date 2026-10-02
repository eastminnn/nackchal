import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource/dynapuff/latin-700.css';
import './styles/index.css';
import { Showcase } from './dev/Showcase';

if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_REACT_DEVTOOLS !== '1') {
  void import('react-grab');
  void import('react-scan').then(({ scan }) => scan({ enabled: true, showToolbar: false }));
}
const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');
createRoot(root).render(<Showcase />);
