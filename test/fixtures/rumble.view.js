// Browser entry for the rumble fixture: no view halves; window.lhView lets the test play an effect on lp.pad as a game does.
import { boot, defineView } from '../../src/index.view.js';
import rumble from './rumble.js';

window.lhView = boot(rumble, defineView({ scenes: {} })).view;
