/**
 * The final look pass — runs after tone mapping, in display space.
 *
 * Everything here is the kind of cheap, high-impact grading a colourist does
 * to a finished frame rather than lighting work: chromatic aberration,
 * contrast/saturation/temperature, vignette and film grain, all folded into
 * ONE resample of the frame so the pass costs a single texture fetch chain.
 *
 * Tuned for a bright afternoon racetrack, not a dark stage: the vignette is a
 * whisper, the grain is under the noise floor of the crowd texture, and the
 * temperature shift only leans the frame a shade warm. The point is cohesion —
 * raw tonemapped output reads as "rendered"; graded output reads as "filmed".
 */
export const GradeShader = {
  name: 'GradeShader',

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.25 },
    uVignette: { value: 0.22 },
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.06 },
    uTemperature: { value: 0.04 },
    uGrain: { value: 0.02 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uTemperature;
    uniform float uGrain;

    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);

      // Chromatic aberration: radial, zero in the centre, strongest in the
      // corners — the way a real lens mis-converges.
      vec3 color;
      if (uAberration > 0.001) {
        vec2 offset = centered * r2 * uAberration * 0.02;
        color.r = texture2D(tDiffuse, uv + offset).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - offset).b;
      } else {
        color = texture2D(tDiffuse, uv).rgb;
      }

      // Contrast around mid grey, then lift/gain room via saturation.
      color = (color - 0.5) * uContrast + 0.5;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      // Temperature: a shade of warm into the reds, out of the blues.
      color.r += uTemperature * 0.12;
      color.b -= uTemperature * 0.12;

      // Vignette falls to (1 - uVignette) in the corners, so the control is
      // literally "how much darker the corners are".
      color *= 1.0 - uVignette * smoothstep(0.15, 0.72, r2 * 1.9);

      // Animated grain, re-seeded every frame so it crawls like film stock.
      if (uGrain > 0.0005) {
        float grain = hash12(uv * vec2(1280.0, 800.0) + fract(uTime) * 137.0) - 0.5;
        color += grain * uGrain;
      }

      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
