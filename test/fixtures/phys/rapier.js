// The one Rapier initialisation for the 3c tests. The engine never imports Rapier (D9): tests import it here and
// inject it through defineGame({ physics: { rapier } }) or createWorld's options.
import R from '@dimforge/rapier3d-compat';

await R.init();
export { R };
