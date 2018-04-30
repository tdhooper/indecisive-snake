var regl = createREGL({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});

var points = 400;
var verts = [];
for (var i = 0; i < points * 2; i++) {
    verts.push([i, i]);
}

var simulatePoints = 101;
var INITIAL_CONDITIONS = [];
for (var i = 0; i < simulatePoints; i++) {
    var x = (i / simulatePoints) * .5 + .5;
    var y = .5 + (Math.random() * 2 - 1) / simulatePoints / 2;
    INITIAL_CONDITIONS = INITIAL_CONDITIONS.concat(x * 255, y * 255, 0, 255);
}

var state = (Array(2)).fill().map(() =>
  regl.framebuffer({
    color: regl.texture({
      width: simulatePoints,
      height: 1,
      data: INITIAL_CONDITIONS,
      type: 'float'
    }),
    depthStencil: false
  })
);

var mouse = [0, 0, 0];

var canvas = document.getElementsByTagName('canvas')[0];

var updateMouse = function(down, up, evt) {
  mouse[0] = (evt.clientX / canvas.clientWidth) * 2 - 1;
  mouse[1] = ((evt.clientY / canvas.clientHeight) * 2 - 1) * -1;
  if (down) {
    mouse[2] = 1;
  }
  if (up) {
    mouse[2] = 0;
  }
};

canvas.addEventListener('mousemove', updateMouse.bind(this, false, false));
canvas.addEventListener('mousedown', updateMouse.bind(this, true, false));
canvas.addEventListener('mouseup', updateMouse.bind(this, false, true));

var update = regl({

  frag: `
  precision mediump float;
  uniform sampler2D state;
  uniform float points;
  uniform float viewWidth;
  uniform float viewHeight;
  uniform vec3 mouse;
  uniform float time;
  varying vec2 uv;

  const int NUM_SAMPLES = 11;
  const int THIS_SAMPLE = 5;
  const int PREV_SAMPLE = 4;
  const int NEXT_SAMPLE = 6;

  void main() {

    vec2 m = mouse.xy;
    float spacing = 5.;
    vec2 p;

    if (viewHeight < viewWidth) {
      m.x *= viewWidth / viewHeight;
    } else {
      m.y *= viewHeight / viewWidth;
    }
    m = m * .5 + .5;

    float t = uv.x;
    bool first = floor(t * points) == 0.;
    bool mousedown = mouse.z == 1.;

    if (first) {
      p = texture2D(state, uv).xy;
      vec2 target;
      if (mousedown) {
        target = m * 255.;
      } else {
        target = (vec2(sin(time), sin(time * 1.8)) * .33 + .5) * 255.;
      }
      vec2 offset = target - p;
      float dd = length(offset);
      p += normalize(offset) * min(dd, spacing * .15);
      gl_FragColor = vec4(p, 1, 1);
      return;
    }

    vec4 samples[NUM_SAMPLES];
    float w = 1. / points;

    float sampleX;
    vec4 sample;
    
    vec2 mean;
    vec2 dir;

    for (int i = 0; i < NUM_SAMPLES; i++) {

      sampleX = clamp(uv.x + w * float(i - (NUM_SAMPLES - 1) / 2), 0., 1.);
      sample = texture2D(state, vec2(sampleX, 0));
      samples[i] = sample;
      mean += sample.xy;
    }

    mean /= float(NUM_SAMPLES);

    for (int i = 0; i < NUM_SAMPLES; i++) {
      dir += samples[i].xy - mean;
    }

    dir = normalize(dir);
    dir = clamp(dir, vec2(-1.), vec2(1.)); // I dunno why, normalize should catch this

    p = samples[THIS_SAMPLE].xy;

    vec2 forward = p + dir * spacing * .5;
    forward = p + normalize(p - samples[NEXT_SAMPLE].xy) * spacing * .15;

    if (first) {
      gl_FragColor = vec4(forward, 1, 1);
      return;
    }

    vec4 prevSample = samples[PREV_SAMPLE];

    vec2 perp = normalize(vec2(dir.y, -dir.x));
    float lineDist = dot(perp, mean - p) * -1.;

    float divergence = .1;

    lineDist = clamp(lineDist, -divergence, divergence);

    p += perp * lineDist / 5.;
    p = prevSample.xy + normalize(p - prevSample.xy) * spacing;

    // p = mix(forward, p, smoothstep(0., .2, t));

    gl_FragColor = vec4(p, 1, 1);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },

  uniforms: {
    points: simulatePoints,
    state: ({tick}) => state[tick % 2],
    mouse: function() {
      return mouse;
    },
    time: regl.context('time'),
    viewWidth: regl.context('drawingBufferWidth'),
    viewHeight: regl.context('drawingBufferHeight')
  },

  depth: { enable: false },

  count: 3,

  framebuffer: ({tick}) => state[(tick + 1) % 2]
});



var debug = regl({

  frag: `
  precision mediump float;
  uniform sampler2D state;
  varying vec2 uv;

  void main() {
    gl_FragColor = texture2D(state, uv) / 255.;
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0, 1);
  }`,

  attributes: {
    position: [ -4, -4, 4, -4, 0, 4 ]
  },

  uniforms: {
    state: ({tick}) => state[tick % 2]
  },

  depth: { enable: false },

  count: 3,
});


var draw = regl({
  primitive: 'triangle strip',

  lineWidth: 1,

  // frontFace: 'cw',

  frag: `
  precision mediump float;
  uniform vec4 color;
  varying float t;
  varying float v;
  void main () {
    float on = smoothstep(0., .5, t);
    vec3 col = vec3(on, 1.-on, 1);
    col = mix(col, col * .25, cos(t * 1000.) * .5 + .5);
    col *= 1.- t;
    col = vec3(1);
    gl_FragColor = vec4(col,1);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform float points;
  uniform float viewWidth;
  uniform float viewHeight;
  uniform sampler2D state;
  varying float t;
  varying float v;
  float PI = 3.14159265359;
  void main () {
    float vertIndex = position.x;
    float invert = mod(vertIndex, 2.) * 2. - 1.;
    // invert = 1.;

    v = floor(vertIndex * .5);

    float t = v / points;
    float t2 = (v + 1.) / points;

    if (t2 < 0.) {
      // t2 = (v + 1.) / points;
      // invert *= -1.;
    }
    vec2 pos = texture2D(state, vec2(t, 0)).xy / 255.;
    vec2 pos2 = texture2D(state, vec2(t2, 0)).xy / 255.;
    vec2 normal = normalize(pos2 - pos);
    vec2 perp = vec2(normal.y, -normal.x);
    
    pos += perp * .01 * invert;
    // convert range(0, 1) to range(-1, 1)
    pos = pos * 2. - 1.;
    // pos = vec2(sin(t * PI * 2.) * .5, cos(t * PI * 2.) * .5);

    if (viewHeight < viewWidth) {
      pos.x *= viewHeight / viewWidth;
    } else {
      pos.y *= viewWidth / viewHeight;
    }
    gl_Position = vec4(pos, 0, 1);
  }`,

  attributes: {
    position: verts
  },

  uniforms: {
    color: [1, 1, 1, 1],
    points: points,
    state: ({tick}) => state[tick % 2],
    viewWidth: regl.context('drawingBufferWidth'),
    viewHeight: regl.context('drawingBufferHeight'),
  },

  count: verts.length
});

console.log(draw);



var tick = regl.frame(function(context) {
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  });

  update();
  draw();
  // debug();
});


/*

texture for positions
framebuffer for positions

tick
  update
  draw

update positions in fragment shader
write positions to texture
display positions

*/