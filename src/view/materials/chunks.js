// Shader patches for the material compiler (M-11). Each feature is a set of GLSL snippets spliced in after (or before) a
// three.js r186 chunk by onBeforeCompile. Every splice goes through inject(), which throws when the chunk is missing, so a
// three.js bump that renames a chunk fails loudly at compile time and in test/compiler-chunks.test.mjs, never silently.
// Variable values are uniforms, never baked into the source: one program per feature set, shared by every material.
import { REVISION } from 'three';

// The chunks each feature patches, per stage. The chunk-guard test walks this table for every tier.
export const CHUNKS = Object.freeze({
  COVERAGE: { vertex: ['common', 'worldpos_vertex'], fragment: ['common', 'color_fragment'] },
  FUR: { vertex: ['common', 'begin_vertex'], fragment: ['common', 'clipping_planes_fragment', 'color_fragment', 'opaque_fragment'] },
  SUBSURFACE: { vertex: [], fragment: ['common', 'lights_fragment_end'] },
  WIND: { vertex: ['common', 'begin_vertex'], fragment: ['normal_fragment_begin'] },
  PAINT: { vertex: ['common', 'begin_vertex'], fragment: ['common', 'color_fragment'] },
});

export function inject(src, chunk, text, where = 'after') {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`materials: three.js r${REVISION} has no '${tag}' in this shader; update src/view/materials/chunks.js`);
  return src.replace(tag, where === 'before' ? `${text}\n${tag}` : `${tag}\n${text}`);
}

// Value noise shared by the coverage layers (one copy for dirt and mud).
const NOISE = `
float lhH( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
float lhN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( lhH( i ), lhH( i + vec3( 1, 0, 0 ) ), f.x ), mix( lhH( i + vec3( 0, 1, 0 ) ), lhH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( lhH( i + vec3( 0, 0, 1 ) ), lhH( i + vec3( 1, 0, 1 ) ), f.x ), mix( lhH( i + vec3( 0, 1, 1 ) ), lhH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;

// COVERAGE: uCoverage = (dirt, rust, snow, mud), each scaled by the material's coverage block (uCoverageAccept). The noise
// is taken in the mesh's own space, so spots ride with the vehicle or animal. COVERAGE_INSTANCED reads the per-instance
// attribute instanceCoverage instead (plus uCoverage as a shared floor) and seeds the mud pattern by gl_InstanceID.
function coverage(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', `varying vec3 vLhP; varying float vLhUp;
#ifdef COVERAGE_INSTANCED
attribute vec4 instanceCoverage; varying vec4 vLhCov; varying float vLhSeed;
#endif`);
  sh.vertexShader = inject(sh.vertexShader, 'worldpos_vertex', `vLhP = transformed;
#ifdef USE_INSTANCING
vLhUp = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal ).y;
#else
vLhUp = normalize( mat3( modelMatrix ) * objectNormal ).y;
#endif
#ifdef COVERAGE_INSTANCED
vLhCov = instanceCoverage; vLhSeed = float( gl_InstanceID );
#endif`);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `uniform vec4 uCoverage; uniform vec4 uCoverageAccept; varying vec3 vLhP; varying float vLhUp;
#ifdef COVERAGE_INSTANCED
varying vec4 vLhCov; varying float vLhSeed;
#endif${NOISE}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `{
#ifdef COVERAGE_INSTANCED
  vec4 lhCov = clamp( uCoverage + vLhCov, 0.0, 1.0 ) * uCoverageAccept; float lhSeed = vLhSeed;
#else
  vec4 lhCov = uCoverage * uCoverageAccept; float lhSeed = 0.0;
#endif
  if ( lhCov.x > 0.002 ) { // dirt: brown spots, more of them low down
    float n = lhN( vLhP * 2.7 ) * 0.65 + lhN( vLhP * 9.0 ) * 0.35;
    float low = clamp( 1.2 - vLhP.y * 0.45, 0.0, 1.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.30, 0.19, 0.10 ), step( n, lhCov.x * 0.8 * low ) * 0.9 );
  }
  if ( lhCov.y > 0.002 ) { // rust: orange-brown blotches
    float n = lhN( vLhP * 5.0 + 17.0 ) * 0.7 + lhN( vLhP * 13.0 ) * 0.3;
    vec3 rc = mix( vec3( 0.36, 0.14, 0.05 ), vec3( 0.55, 0.27, 0.09 ), lhN( vLhP * 21.0 ) );
    diffuseColor.rgb = mix( diffuseColor.rgb, rc, smoothstep( 1.0 - lhCov.y * 0.7, 1.05 - lhCov.y * 0.7, n ) );
  }
  if ( lhCov.z > 0.002 ) { // snow: settles on faces that point up
    float n = lhN( vLhP * 6.0 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.93, 0.95, 1.0 ), smoothstep( 1.0 - lhCov.z, 1.15 - lhCov.z, vLhUp * 0.85 + n * 0.15 ) );
  }
  if ( lhCov.w > 0.002 ) { // mud: blotches that creep up from the feet as the level rises
    vec3 mp = vLhP * 2.3 + vec3( lhSeed * 31.7, lhSeed * 17.3, lhSeed * 7.1 );
    float h = clamp( vLhP.y / 1.5, 0.0, 1.0 );
    float n = lhN( mp ) * 0.75 + lhN( mp * 2.4 ) * 0.25;
    float th = 1.22 - lhCov.w * 0.98;
    float m = smoothstep( th, th + 0.07, n * 0.6 + ( 1.0 - h ) * 0.6 );
    vec3 mc = mix( vec3( 0.15, 0.072, 0.028 ), vec3( 0.26, 0.135, 0.058 ), lhN( mp * 4.0 ) ) * ( 0.75 + 0.25 * h );
    diffuseColor.rgb = mix( diffuseColor.rgb, mc, m );
  }
}`);
}

// FUR: shells are copies of the mesh pushed out along a smoothed normal (furGeometry). Shell 0 is the
// mesh itself and draws untouched; outer shells keep only fragments inside a strand of 3D cell noise. furMask (0..1)
// scales strand length per vertex, so a 0 mask is bare skin and a soft mask fades the fur out.
function fur(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', `attribute vec3 furNormal; attribute float furMask; attribute float furShell; uniform float furLen;
varying vec3 vFurP; varying float vFurMask; varying float vFurShell;`);
  sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', `vFurP = position; vFurMask = furMask; vFurShell = furShell;
transformed += ( furNormal * furLen - vec3( 0.0, 0.25 * furLen * furShell, 0.0 ) ) * furShell * furMask; // tips droop a little`);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', `uniform float furDensity; uniform vec3 furTint; varying vec3 vFurP; varying float vFurMask; varying float vFurShell;
vec3 furHash( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.xxy + p.yxx ) * p.zyx ); }`);
  sh.fragmentShader = inject(sh.fragmentShader, 'clipping_planes_fragment', `float furAA = length( fwidth( vFurP * furDensity ) ); // far away, strands fatten into soft shells rather than shimmer
if ( vFurShell > 0.0 ) {
  if ( vFurMask < 0.02 ) discard;
  vec3 fp = vFurP * furDensity, fc = floor( fp ); float best = 9.0, h = 0.0;
  for ( int i = 0; i < 8; i ++ ) { // nearest strand in a jittered 3D grid; each strand has its own length and thins to its tip
    vec3 c = fc + vec3( i & 1, ( i >> 1 ) & 1, i >> 2 ) - 1.0 + step( 0.5, fract( fp ) );
    vec3 r = furHash( c ); float d = length( fp - ( c + r * 0.8 + 0.1 ) );
    if ( d < best ) { best = d; h = ( 0.45 + 0.55 * r.x ) * vFurMask; }
  }
  if ( vFurShell > h + furAA * 0.3 || best > 0.62 * ( 1.0 - vFurShell / h ) + furAA * 0.5 ) discard;
}`);
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `if ( vFurShell > 0.0 ) diffuseColor.rgb *= mix( vec3( 0.72 ), 1.06 * furTint, vFurShell ); // darker at the roots`);
  sh.fragmentShader = inject(sh.fragmentShader, 'opaque_fragment', `if ( vFurShell > 0.0 ) {
  float furRim = pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), 2.0 );
  outgoingLight += diffuseColor.rgb * furRim * vFurShell * 0.35;
}`, 'before');
}

// SUBSURFACE: soft translucency per directional light (skin, wax, leaves, pets). Three parts, all energy-scaled like three's own
// Lambert (BRDF_Lambert: albedo / π), so strength 1 is at most a fraction of the direct diffuse light, never a wash over lit faces:
//  - wrap: light bleeds a little past the terminator, zero on faces that face the light (so flat lit faces keep their colour);
//  - rim: a haze on silhouettes (grazing to the view), lit by the light's wrapped side, so edges look slightly translucent;
//  - back: transmission when the light is behind the surface from the viewer, on the rim only.
// uSubColor tints the scattered light and multiplies the albedo, so white (the default) keeps the surface's own hue.
// Physical and standard only (the compiler drops it for lambert, and when strength is 0).
function subsurface(sh) {
  sh.fragmentShader = inject(sh.fragmentShader, 'common', 'uniform vec3 uSubColor; uniform float uSubStrength;');
  sh.fragmentShader = inject(sh.fragmentShader, 'lights_fragment_end', `#if NUM_DIR_LIGHTS > 0
vec3 lhV = normalize( vViewPosition );
float lhRim = pow( 1.0 - saturate( dot( normal, lhV ) ), 3.0 );
for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
  vec3 lhL = directionalLights[ i ].direction;
  float lhNL = dot( normal, lhL );
  float lhWrap = saturate( ( lhNL + 0.4 ) / 1.4 ) - saturate( lhNL );      // only past the terminator
  float lhBack = pow( saturate( dot( lhV, -lhL ) ), 4.0 );                   // light from behind the surface
  float lhSss = lhWrap + lhRim * ( 0.6 * saturate( lhNL + 0.4 ) + lhBack );
  reflectedLight.directDiffuse += uSubStrength * lhSss * directionalLights[ i ].color * BRDF_Lambert( uSubColor * diffuseColor.rgb );
}
#endif`);
}

// WIND (grass and foliage): blades sway by height squared, phase from the instance's world position, and
// shrink to nothing between uWindFade.x and .y metres from the camera (off when y <= x). Lit as facing their normal from
// both sides, so double-sided blades have no black undersides.
function wind(sh) {
  sh.vertexShader = inject(sh.vertexShader, 'common', 'uniform float uLhTime; uniform vec2 uWindFade; uniform vec2 uWindAmp;');
  sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', `#ifdef USE_INSTANCING
vec4 lhRoot = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#else
vec4 lhRoot = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
#endif
if ( uWindFade.y > uWindFade.x ) transformed *= 1.0 - smoothstep( uWindFade.x, uWindFade.y, distance( lhRoot.xz, cameraPosition.xz ) );
float lhPh = lhRoot.x * 0.37 + lhRoot.z * 0.23, lhHh = transformed.y * transformed.y;
transformed.x += sin( uLhTime * 1.7 + lhPh ) * uWindAmp.x * lhHh;
transformed.z += sin( uLhTime * 1.1 + lhPh * 1.3 ) * uWindAmp.y * lhHh;`);
  sh.fragmentShader = inject(sh.fragmentShader, 'normal_fragment_begin', `#ifndef FLAT_SHADED
normal = normalize( vNormal );
#endif`);
}

// PAINT (Task 8b): a paint slot that keeps its vertex shading. lhPaint = (model-space xyz, brightness b over
// the slot's brightest vertex, written by mc.apply). k = min(max, floor + gain × b) from uPaintShade. uPaintMode.x: 0 keeps the vertex
// colours, 1 paints diffuse × k (× instanceColor), 2 paints a hue ramp hsl(fract(dot(xyz, axis) + w), s, l) × k. Worked out per
// vertex, as 1.8's vertex colours were, so triangles blend the same RGB. Injected last, so it runs before the coverage layers.
function paint(sh) {
  const hsl = `float lhHue( float p, float q, float t ) { if ( t < 0.0 ) t += 1.0; if ( t > 1.0 ) t -= 1.0;
  if ( t < 1.0 / 6.0 ) return p + ( q - p ) * 6.0 * t; if ( t < 0.5 ) return q; if ( t < 2.0 / 3.0 ) return p + ( q - p ) * 6.0 * ( 2.0 / 3.0 - t ); return p; }
vec3 lhHsl( float h, float s, float l ) { float p = l <= 0.5 ? l * ( 1.0 + s ) : l + s - l * s, q = 2.0 * l - p; // three's Color.setHSL
  return vec3( lhHue( q, p, h + 1.0 / 3.0 ), lhHue( q, p, h ), lhHue( q, p, h - 1.0 / 3.0 ) ); }`;
  sh.vertexShader = inject(sh.vertexShader, 'common', `attribute vec4 lhPaint; uniform vec3 uPaintMode; uniform vec4 uPaintAxis; uniform vec3 uPaintShade; varying vec3 vLhPaint;
${hsl}`);
  sh.vertexShader = inject(sh.vertexShader, 'begin_vertex', `float lhK = min( uPaintShade.z, uPaintShade.x + uPaintShade.y * lhPaint.w );
vLhPaint = vec3( lhK );
#ifdef USE_INSTANCING_COLOR
vLhPaint *= instanceColor.rgb;
#endif
if ( uPaintMode.x > 1.5 ) vLhPaint = lhHsl( fract( dot( lhPaint.xyz, uPaintAxis.xyz ) + uPaintAxis.w ), uPaintMode.y, uPaintMode.z ) * lhK;`);
  sh.fragmentShader = inject(sh.fragmentShader, 'common', 'uniform vec3 uPaintMode; varying vec3 vLhPaint;');
  sh.fragmentShader = inject(sh.fragmentShader, 'color_fragment', `if ( uPaintMode.x > 1.5 ) diffuseColor.rgb = vLhPaint;
else if ( uPaintMode.x > 0.5 ) diffuseColor.rgb = diffuse * vLhPaint;`);
}

const PATCH = { COVERAGE: coverage, FUR: fur, SUBSURFACE: subsurface, WIND: wind, PAINT: paint };

// Applies the features in a fixed order (CHUNKS order), whatever order they are listed in.
// The features that move vertices, and so must move them in the shadow pass too (mc.depth). Only their vertex stage is patched:
// the depth fragment shader has none of the colour chunks, so each patch runs against a stand-in fragment that has them.
export const DEPTH_FEATURES = Object.freeze(['FUR', 'WIND']);
const FRAG_TAGS = [...new Set(Object.values(CHUNKS).flatMap(c => c.fragment))].map(c => `#include <${c}>`).join('\n');
export function patchDepth(sh, features) {
  for (const f of DEPTH_FEATURES) if (features.includes(f)) {
    const t = { vertexShader: sh.vertexShader, fragmentShader: FRAG_TAGS, uniforms: sh.uniforms };
    PATCH[f](t); sh.vertexShader = t.vertexShader;
  }
  return sh;
}
export function patchShader(sh, features) {
  for (const f of Object.keys(CHUNKS)) if (features.includes(f)) PATCH[f](sh);
  return sh;
}
