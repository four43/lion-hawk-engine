// happy-dom window for view unit tests (no real browser); each test gets a fresh one.
import { Window } from 'happy-dom';
export const dom = () => { const window = new Window({ url: 'http://localhost/' }); return { window, document: window.document }; };
