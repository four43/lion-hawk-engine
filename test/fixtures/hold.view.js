// Browser entry for the hold fixture: no view halves; the page adopts the hold into its slot.
import { boot, defineView } from '../../src/index.view.js';
import hold from './hold.js';

boot(hold, defineView({ scenes: {} }));
