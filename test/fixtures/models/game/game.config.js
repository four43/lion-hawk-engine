// Fixture game for the lion-hawk CLI tests (3d): every bake convention and the build steps on five small models.
export default {
  id: 'fixture', outEnv: 'LH_FIXTURE_OUT',
  bake: {
    materials: './materials.js', palette: 'vertex', paint: { base: 'steel' },
    rename: { materials: { colormap: 'flesh' }, nodes: { hat: 'sock-hat' } },
    models: {
      ramp: { static: true },
      pet: { animTable: { fps: 10, clips: ['walk', 'idle'] }, sockets: ['hat'] },
      palette: { rename: { materials: { colormap: 'plastic' } } },
    },
  },
  build: { entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: './build.hooks.js' },
};
