(function () {
  'use strict';

  var EMBED = /[?&]embed/.test(window.location.search || '');
  if (EMBED) document.body.classList.add('embed');

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ss(t, a, b) { var x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function K(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }       // sRGB hex -> linear colour
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  /* palette: graphite, pearl, brass, sea-glass */
  var P = {
    pearl: 0xeeebe4, graphite: 0x1b2027, carbon: 0x232a33, brass: 0xc8a15a, steel: 0xaab2bc,
    glass: 0x2b3947, seaglass: 0x7fb7b2, horizon: 0xe8dcc8, mid: 0xa9c3da, top: 0x5f86b0
  };
  function std(color, o) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: K(color), roughness: 0.5, metalness: 0.1 }, o || {}));
  }

  /* smooth cardinal-spline interpolation through keyframes */
  function keyInterp(T, V, t) {
    var n = T.length, i = 0;
    while (i < n - 2 && t > T[i + 1]) i++;
    var t0 = T[i], t1 = T[i + 1], h = t1 - t0, u = clamp((t - t0) / h, 0, 1);
    function m(k) {
      if (k <= 0) return (V[1] - V[0]) / (T[1] - T[0]);
      if (k >= n - 1) return (V[n - 1] - V[n - 2]) / (T[n - 1] - T[n - 2]);
      return (V[k + 1] - V[k - 1]) / (T[k + 1] - T[k - 1]);
    }
    var u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * V[i] + (u3 - 2 * u2 + u) * h * m(i) +
           (-2 * u3 + 3 * u2) * V[i + 1] + (u3 - u2) * h * m(i + 1);
  }

  /* ---------- renderer, scene, camera ---------- */
  var canvas = $('c');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(K(P.horizon), 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(K(P.horizon), 60, 230);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);

  scene.add(new THREE.HemisphereLight(K(0xeaf1fa), K(0x6b705f), 0.8));
  var sun = new THREE.DirectionalLight(K(0xfff0d8), 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  /* sky dome with gradient + soft sun glow, follows the camera */
  var skyGroup = new THREE.Group(); scene.add(skyGroup);
  (function () {
    var g = new THREE.SphereGeometry(520, 32, 20), cols = [], pos = g.attributes.position;
    var cH = K(P.horizon), cM = K(P.mid), cT = K(P.top), c = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var h = clamp(pos.getY(i) / 520, 0, 1);
      c.copy(cH).lerp(cM, ss(h, 0.0, 0.32)).lerp(cT, ss(h, 0.32, 0.95));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    var sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -2; skyGroup.add(sky);

    var gc = document.createElement('canvas'); gc.width = gc.height = 256;
    var x = gc.getContext('2d');
    if (x) {
      var rg = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      rg.addColorStop(0, 'rgba(255,246,226,0.95)'); rg.addColorStop(0.18, 'rgba(255,232,190,0.55)'); rg.addColorStop(1, 'rgba(255,225,180,0)');
      x.fillStyle = rg; x.fillRect(0, 0, 256, 256);
    }
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    glow.scale.set(260, 260, 1); glow.position.set(330, 95, -330); glow.renderOrder = -1; skyGroup.add(glow);
  })();

  /* ---------- world: quay, road, ramp, sea ---------- */
  var land = new THREE.Mesh(new THREE.BoxGeometry(90, 4, 90), std(0x8f9a80, { roughness: 1, metalness: 0 }));
  land.position.set(-55, 0.6 - 2, 0); land.receiveShadow = true; scene.add(land);

  var road = new THREE.Mesh(new THREE.PlaneGeometry(90, 4.4), std(0x2f343c, { roughness: 0.92, metalness: 0 }));
  road.rotation.x = -Math.PI / 2; road.position.set(-55, 0.603, 0); road.receiveShadow = true; scene.add(road);

  var lineMat = new THREE.MeshBasicMaterial({ color: K(0xe9e6df) });
  var dashGeo = new THREE.BoxGeometry(1.8, 0.01, 0.12), edgeGeo = new THREE.BoxGeometry(90, 0.01, 0.1);
  var i;
  for (i = 0; i < 22; i++) { var d = new THREE.Mesh(dashGeo, lineMat); d.position.set(-98 + i * 4, 0.61, 0); scene.add(d); }
  [-2.05, 2.05].forEach(function (z) { var e = new THREE.Mesh(edgeGeo, lineMat); e.position.set(-55, 0.61, z); scene.add(e); });

  var rampShape = new THREE.Shape();
  rampShape.moveTo(-10, 0.6); rampShape.lineTo(-4, -0.5); rampShape.lineTo(-4, -3); rampShape.lineTo(-10, -3); rampShape.closePath();
  var rampGeo = new THREE.ExtrudeGeometry(rampShape, { depth: 4.4, bevelEnabled: false });
  rampGeo.translate(0, 0, -2.2);
  var ramp = new THREE.Mesh(rampGeo, std(0x7b818a, { roughness: 0.95, metalness: 0 }));
  ramp.receiveShadow = true; scene.add(ramp);

  function groundY(x) {
    if (x < -10) return 0.6;
    if (x < -4) return lerp(0.6, -0.5, (x + 10) / 6);
    return -0.5;
  }

  var WATER_CX = 40, WATER_W = 260, WATER_H = 140, SEG_X = 130, SEG_Y = 70;
  var waterGeo = new THREE.PlaneGeometry(WATER_W, WATER_H, SEG_X, SEG_Y);
  var wCount = waterGeo.attributes.position.count, wCols = new Float32Array(wCount * 3);
  waterGeo.setAttribute('color', new THREE.BufferAttribute(wCols, 3));
  var water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({
    vertexColors: true, specular: K(0xcfe3ea), shininess: 110, transparent: true, opacity: 0.92
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(WATER_CX, 0, 0); water.receiveShadow = true; scene.add(water);

  var bed = new THREE.Mesh(new THREE.PlaneGeometry(700, 500), new THREE.MeshBasicMaterial({ color: K(0x0f3a4a) }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(60, -4, 0); scene.add(bed);

  function waveAt(xw, zw, tt) {
    var gx = xw - WATER_CX, gy = -zw;
    return 0.07 * Math.sin(gx * 0.35 + tt * 1.2) + 0.05 * Math.sin(gy * 0.5 + tt * 0.9) + 0.03 * Math.sin((gx + gy) * 0.9 + tt * 1.7);
  }
  var cDeep = K(0x1d5d75), cCrest = K(0x5fa9b6), cTmp = new THREE.Color();

  /* lamp posts and buoys: speed cues */
  var poleMat = std(0x7e8794, { metalness: 0.5 }), lampMat = new THREE.MeshBasicMaterial({ color: K(0xffe6b0) });
  var poleGeo = new THREE.CylinderGeometry(0.05, 0.065, 3.4, 10), lampGeo = new THREE.SphereGeometry(0.16, 12, 8);
  for (i = 0; i < 10; i++) {
    var side = i % 2 ? 1 : -1;
    var pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(-92 + i * 8, 0.6 + 1.7, side * 2.9); pole.castShadow = true; scene.add(pole);
    var lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(-92 + i * 8, 0.6 + 3.45, side * 2.9); scene.add(lamp);
  }
  var buoys = [], buoyGeo = new THREE.SphereGeometry(0.28, 16, 12);
  var buoyA = std(0xd07a42, { roughness: 0.4 }), buoyB = std(0xeeebe4, { roughness: 0.4 });
  for (i = 0; i < 20; i++) {
    var bu = new THREE.Mesh(buoyGeo, i % 2 ? buoyA : buoyB);
    bu.userData = { x: 2 + i * 9, z: (i % 2 ? 6 : -6) }; bu.castShadow = true; scene.add(bu); buoys.push(bu);
  }

  /* distant hills and clouds */
  var hillMat = std(0x8aa0ad, { roughness: 1, metalness: 0, flatShading: true });
  for (i = 0; i < 10; i++) {
    var hr = 14 + rnd() * 18;
    var hill = new THREE.Mesh(new THREE.ConeGeometry(hr, hr * (0.8 + rnd() * 0.5), 7), hillMat);
    hill.position.set(-70 + i * 26 + rnd() * 10, hr * 0.35 - 4, (i % 2 ? 1 : -1) * (80 + rnd() * 55)); scene.add(hill);
  }
  var clouds = [], cloudMat = new THREE.MeshLambertMaterial({ color: K(0xfdf8ee), transparent: true, opacity: 0.9 });
  for (i = 0; i < 16; i++) {
    var cg = new THREE.Group();
    for (var k = 0; k < 4; k++) {
      var cs = new THREE.Mesh(new THREE.SphereGeometry(2 + rnd() * 2.2, 14, 10), cloudMat);
      cs.position.set(k * 2.6 - 4, rnd() * 1.2, rnd() * 2 - 1); cs.scale.y = 0.5; cg.add(cs);
    }
    cg.position.set(-80 + rnd() * 280, 17 + rnd() * 16, -70 + rnd() * 140);
    scene.add(cg); clouds.push(cg);
  }

  /* ---------- the vehicle ---------- */
  var carbon = std(P.carbon, { roughness: 0.45, metalness: 0.35 });
  var titanium = std(P.steel, { roughness: 0.3, metalness: 0.85 });
  var brassMat = std(P.brass, { roughness: 0.3, metalness: 0.85 });
  var tireMat = std(0x14171c, { roughness: 0.9, metalness: 0 });

  function hullGeometry() {
    var pts = [], L = 1.95, N = 64;
    for (var n = 0; n <= N; n++) {
      var s = -1 + 2 * n / N;                                     // -1 stern ... +1 bow
      pts.push(new THREE.Vector2(Math.pow(Math.max(0, 1 - s * s), 0.62) * (0.6 - 0.1 * s), s * L));
    }
    var g = new THREE.LatheGeometry(pts, 72);
    g.rotateZ(-Math.PI / 2);                                       // axis -> +x
    var pos = g.attributes.position, cols = [], cP = K(P.pearl), cG = K(P.graphite), cB = K(P.brass), c = new THREE.Color();
    for (var j = 0; j < pos.count; j++) {
      var x = pos.getX(j), y = pos.getY(j) * 0.62;
      c.copy(cP).lerp(cG, ss(-y, 0.0, 0.2)).lerp(cB, ss(x, 1.45, 1.85) * 0.95);
      c.lerp(cG, ss(-x, 1.55, 1.9) * 0.9);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }

  function makeRotor(R) {
    var g = new THREE.Group();
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 14), titanium);
    var blades = new THREE.Group();
    for (var j = 0; j < 2; j++) {
      var bl = new THREE.Mesh(new THREE.BoxGeometry(R * 0.98, 0.01, 0.06), carbon);
      bl.position.x = (j ? -1 : 1) * R * 0.49; blades.add(bl);
    }
    var disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48),
      new THREE.MeshBasicMaterial({ color: K(0xffffff), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    g.add(hub, blades, disc);
    g.userData = { blades: blades, disc: disc };
    return g;
  }

  function buildVehicle() {
    var v = new THREE.Group(), parts = { arms: [], rotors: [], wheels: [] };

    var hull = new THREE.Mesh(hullGeometry(), new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.3, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.18
    }));
    hull.scale.set(1, 0.62, 1); hull.castShadow = true; v.add(hull);

    var canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: K(P.glass), transparent: true, opacity: 0.62, roughness: 0.05, metalness: 0.25, clearcoat: 1 }));
    canopy.scale.set(0.85, 0.5, 0.42); canopy.position.set(-0.1, 0.2, 0); v.add(canopy);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 10, 80), brassMat);
    rim.rotation.x = Math.PI / 2; rim.scale.set(0.85, 0.42, 1); rim.position.set(-0.1, 0.205, 0); v.add(rim);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), std(P.pearl, { roughness: 0.35 }));
    head.position.set(-0.14, 0.5, 0); v.add(head);
    var torso = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), std(P.graphite));
    torso.scale.set(0.17, 0.21, 0.15); torso.position.set(-0.14, 0.32, 0); v.add(torso);

    [-0.2, 0.2].forEach(function (z) {
      var hl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: K(0xfff3cf) }));
      hl.position.set(1.8, 0.05, z); v.add(hl);
    });

    /* folding arms: 4 arms, 2 coaxial rotors on each = 8 rotors */
    var ARM = 1.2;
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s, ai) {
      var sx = s[0], sz = s[1];
      var pivot = new THREE.Group(); pivot.position.set(sx * 0.7, 0.3, sz * 0.45);
      pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), titanium));
      var armGeo = new THREE.CylinderGeometry(0.032, 0.04, ARM, 12); armGeo.rotateZ(Math.PI / 2); armGeo.translate(ARM / 2, 0, 0);
      var arm = new THREE.Mesh(armGeo, carbon); arm.castShadow = true; pivot.add(arm);
      var motor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 20), brassMat);
      motor.position.set(ARM, 0.03, 0); motor.castShadow = true; pivot.add(motor);
      var guardGeo = new THREE.TorusGeometry(0.53, 0.012, 8, 56); guardGeo.rotateX(Math.PI / 2);
      var guard = new THREE.Mesh(guardGeo, std(P.pearl, { roughness: 0.4, metalness: 0.2 })); guard.position.set(ARM, 0.08, 0); pivot.add(guard);
      [0.1, 0.22].forEach(function (h, idx) {
        var r = makeRotor(0.5); r.position.set(ARM, h, 0);
        r.userData.dir = idx ? -1 : 1; r.userData.ai = ai; pivot.add(r); parts.rotors.push(r);
      });
      pivot.userData = { thU: Math.atan2(-sz * 0.94, sx * 0.35), thF: sx > 0 ? 0 : (sz > 0 ? -Math.PI : Math.PI), ai: ai };
      pivot.rotation.y = pivot.userData.thF;
      v.add(pivot); parts.arms.push(pivot);
    });

    /* retractable wheels: tyre, brass rim, five spokes */
    [{ x: 1.25, z: 0 }, { x: -1.0, z: 0.62 }, { x: -1.0, z: -0.62 }].forEach(function (p, wi) {
      var w = new THREE.Group(), spin = new THREE.Group();
      var tireGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 32); tireGeo.rotateX(Math.PI / 2);
      var tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true; spin.add(tire);
      var rimGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.17, 24); rimGeo.rotateX(Math.PI / 2);
      spin.add(new THREE.Mesh(rimGeo, brassMat));
      for (var sp = 0; sp < 5; sp++) {
        [0.088, -0.088].forEach(function (zz) {
          var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.012), titanium);
          spoke.position.set(Math.cos(sp * 1.2566) * 0.1, Math.sin(sp * 1.2566) * 0.1, zz);
          spoke.rotation.z = sp * 1.2566; spin.add(spoke);
        });
      }
      w.add(spin);
      w.userData = { spin: spin, wi: wi, down: new THREE.Vector3(p.x, -0.32, p.z), up: new THREE.Vector3(p.x * 0.7, -0.02, p.z * 0.4) };
      w.position.copy(w.userData.down);
      v.add(w); parts.wheels.push(w);
    });

    /* retractable hydrofoil */
    var foil = new THREE.Group(); foil.position.set(0.15, -0.28, 0);
    var strutGeo = new THREE.BoxGeometry(0.07, 1.15, 0.15); strutGeo.translate(0, -0.575, 0);
    foil.add(new THREE.Mesh(strutGeo, titanium));
    var fuseGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12); fuseGeo.rotateZ(Math.PI / 2); fuseGeo.translate(-0.3, -1.15, 0);
    foil.add(new THREE.Mesh(fuseGeo, titanium));
    var wingMat = std(0xdfe3e7, { roughness: 0.35, metalness: 0.4 });
    var fw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 1.55), wingMat); fw.position.set(0.45, -1.15, 0); foil.add(fw);
    var tw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.6), wingMat); tw.position.set(-1.0, -1.12, 0); foil.add(tw);
    var podGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 18); podGeo.rotateZ(Math.PI / 2);
    var pod = new THREE.Mesh(podGeo, brassMat); pod.position.set(0.0, -1.15, 0); foil.add(pod);
    var prop = new THREE.Group(); prop.position.set(-0.24, -1.15, 0);
    var pb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.05), carbon); prop.add(pb);
    var pb2 = pb.clone(); pb2.rotation.x = Math.PI / 2; prop.add(pb2);
    foil.add(prop); v.add(foil);
    parts.foil = foil; parts.prop = prop;

    v.traverse(function (o) { if (o.isMesh && !(o.material && (o.material.transparent || o.material.type === 'MeshBasicMaterial'))) o.castShadow = true; });
    return { group: v, parts: parts };
  }

  var vehicle = buildVehicle();
  scene.add(vehicle.group);

  /* wake streak behind the vehicle */
  var wakeTex = (function () {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64;
    var x = c.getContext('2d');
    if (x) {
      var gx = x.createLinearGradient(0, 0, 256, 0);
      gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(1, 'rgba(255,255,255,0.85)');
      x.fillStyle = gx; x.fillRect(0, 0, 256, 64);
      x.globalCompositeOperation = 'destination-in';
      var gy = x.createLinearGradient(0, 0, 0, 64);
      gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gy; x.fillRect(0, 0, 256, 64);
    }
    return new THREE.CanvasTexture(c);
  })();
  var wakeGeo = new THREE.PlaneGeometry(8, 2); wakeGeo.rotateX(-Math.PI / 2); wakeGeo.translate(-4, 0, 0);
  var wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0, fog: true }));
  wake.renderOrder = 2; scene.add(wake);

  /* spray particles */
  var WN = 260, wpos = new Float32Array(WN * 3), wcol = new Float32Array(WN * 3);
  var wvel = new Float32Array(WN * 3), wlife = new Float32Array(WN), wcur = 0;
  for (i = 0; i < WN; i++) wpos[i * 3 + 1] = -50;
  var wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wgeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
  var dot = document.createElement('canvas'); dot.width = dot.height = 32;
  var dctx = dot.getContext('2d');
  if (dctx) {
    var grd = dctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    dctx.fillStyle = grd; dctx.fillRect(0, 0, 32, 32);
  }
  var spray = new THREE.Points(wgeo, new THREE.PointsMaterial({
    size: 0.3, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95
  }));
  spray.frustumCulled = false; scene.add(spray);

  function spawn(px, py, pz, vx, vy, vz) {
    wcur = (wcur + 1) % WN; var j = wcur * 3;
    wpos[j] = px; wpos[j + 1] = py; wpos[j + 2] = pz;
    wvel[j] = vx; wvel[j + 1] = vy; wvel[j + 2] = vz; wlife[wcur] = 1.3;
  }
  var sprayDeep = K(0x1d5d75), sprayWhite = K(0xffffff);
  function stepSpray(dt) {
    for (var n = 0; n < WN; n++) {
      var j = n * 3;
      if (wlife[n] <= 0) { wpos[j + 1] = -50; continue; }
      wlife[n] -= dt; wvel[j + 1] -= 3.4 * dt;
      wpos[j] += wvel[j] * dt; wpos[j + 1] += wvel[j + 1] * dt; wpos[j + 2] += wvel[j + 2] * dt;
      if (wpos[j + 1] < 0) wlife[n] = 0;
      var f = clamp(wlife[n] / 1.3, 0, 1);
      wcol[j] = lerp(sprayDeep.r, 1, f); wcol[j + 1] = lerp(sprayDeep.g, 1, f); wcol[j + 2] = lerp(sprayDeep.b, 1, f);
    }
    wgeo.attributes.position.needsUpdate = true; wgeo.attributes.color.needsUpdate = true;
  }

  /* ---------- timeline ---------- */
  var KT = [0, 7, 10, 13, 16, 18.5, 22, 24, 27, 33.5];
  var KX = [-44, -12, -2, 4, 10, 26, 58, 76, 100, 178];
  var MODES = [
    { end: 10,   tag: 'ROAD MODE',   color: '#c8a15a', desc: 'Hub-motor wheels · up to about 40 km/h · rotor arms folded' },
    { end: 14.5, tag: 'WATER MODE',  color: '#7fb7b2', desc: 'Wheels retract into the hull · the hull floats' },
    { end: 21.5, tag: 'HYDROFOIL',   color: '#7fb7b2', desc: 'The foil lifts the hull at about 7 m/s · cruise on roughly 4 to 8 kW' },
    { end: 24.5, tag: 'TRANSITION',  color: '#f2efe9', desc: 'Rotor arms unfold · eight rotors spin up' },
    { end: 99,   tag: 'FLIGHT MODE', color: '#c8a15a', desc: 'Eight rotors · about 80 kW in hover · 10 to 15 minute hops' }
  ];
  var SEGS = { auto: [0, 33.8], road: [0, 9.8], water: [10.2, 14.4], foil: [14.8, 21.4], fly: [24.8, 33.8] };
  var seg = SEGS.auto, tl = 0, animT = 0, fading = false, curMode = -1, snapCam = true, paused = false;
  var spinAcc = 0, sprayAcc = 0;

  /* camera shots: azimuth, elevation, distance over time */
  var CT = [0, 6, 10, 14, 18, 22, 26, 30, 33.8];
  var CAZ = [2.45, 1.45, 0.95, 0.55, 0.35, 1.2, 2.0, 2.9, 3.5];
  var CEL = [0.2, 0.16, 0.22, 0.12, 0.08, 0.2, 0.3, 0.38, 0.45];
  var CD = [9, 8.5, 9, 9, 10, 12.5, 15, 19, 22];

  function modeIndex(t) { for (var m = 0; m < MODES.length; m++) if (t < MODES[m].end) return m; return MODES.length - 1; }

  function applyPose(t, dt) {
    var x = keyInterp(KT, KX, t);
    var vx = (keyInterp(KT, KX, t + 0.05) - x) / 0.05;

    var w = ss(t, 9.5, 11.5);
    var liftF = ss(t, 24.6, 26.5);
    var floatF = w * (1 - liftF);
    var raise = 0.85 * ss(t, 17, 19.2) * (1 - liftF);
    var alt = 8 * ss(t, 24.5, 30);
    var bobF = floatF * (1 - ss(t, 16.5, 18.5));
    var waveH = waveAt(x, 0, animT);
    var y = lerp(groundY(x) + 0.6, waveH, w) + raise + alt + Math.sin(animT * 2.1) * 0.04 * bobF;

    var rampPitch = -0.18 * ss(x, -10.6, -9.4) * (1 - ss(x, -5, -3.6)) * (1 - w);
    var foilPitch = 0.07 * ss(t, 15.5, 17.5) * (1 - ss(t, 18.5, 20.5));
    var flyPitch = -0.16 * ss(t, 25.5, 28.5);
    var pitch = rampPitch + foilPitch + flyPitch + Math.sin(animT * 1.7) * 0.02 * bobF;
    var roll = Math.sin(animT * 0.8) * 0.05 * ss(t, 27, 29) + Math.sin(animT * 1.3) * 0.015 * bobF;

    var g = vehicle.group; g.position.set(x, y, 0); g.rotation.set(roll, 0, pitch);
    var parts = vehicle.parts;

    spinAcc += (vx * (1 - w)) * dt / 0.28;
    parts.wheels.forEach(function (wh) {
      var u = wh.userData, ret = ss(t, 11 + 0.3 * u.wi, 13.2 + 0.3 * u.wi);
      wh.position.lerpVectors(u.down, u.up, ret);
      var s = Math.max(0.001, 1 - 0.95 * ret); wh.scale.set(s, s, s);
      u.spin.rotation.z = -spinAcc;
    });

    var fd = ss(t, 14.5, 16.8) * (1 - ss(t, 25.2, 27.2));
    parts.foil.visible = fd > 0.01; parts.foil.scale.y = Math.max(fd, 0.001);
    parts.prop.rotation.x += dt * 40 * fd * (0.3 + 0.7 * ss(t, 15, 19));

    parts.arms.forEach(function (a) {
      var u = ss(t, 21.5 + 0.28 * a.userData.ai, 24 + 0.28 * a.userData.ai);
      a.rotation.y = lerp(a.userData.thF, a.userData.thU, u);
    });
    var maxOmega = 0;
    parts.rotors.forEach(function (r) {
      var om = 40 * ss(t, 22.2 + 0.25 * r.userData.ai, 25 + 0.25 * r.userData.ai);
      maxOmega = Math.max(maxOmega, om);
      r.userData.blades.rotation.y += r.userData.dir * om * dt;
      r.userData.disc.material.opacity = 0.2 * (om / 40);
    });

    /* wake + spray */
    var onWater = w > 0.5 && (raise + alt) < 2.5;
    var wakeStrength = onWater ? clamp(vx / 6, 0, 1) * (1 - ss(t, 24.6, 27)) : 0;
    wake.material.opacity = 0.75 * wakeStrength;
    wake.position.set(x - 1.4, waveH + 0.05, 0);
    wake.scale.set(clamp(vx * 0.16, 0.05, 1.5), 1, 1 + 0.6 * ss(t, 14.5, 19));
    if (onWater && x > -3) {
      sprayAcc += dt * (4 + Math.abs(vx) * 7) * (1 - ss(t, 24.6, 27));
      while (sprayAcc > 1) {
        sprayAcc -= 1;
        spawn(x - 1.6, 0.05, (Math.random() - 0.5) * 0.9, -Math.abs(vx) * 0.12 - Math.random() * 0.4, 0.8 + Math.random() * 1.1, (Math.random() - 0.5) * 1.6);
      }
    }
    if (alt > 0.2 && alt < 3.6 && maxOmega > 15) {
      for (var q = 0; q < 2; q++) {
        var ang = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * 0.8;
        spawn(x + Math.cos(ang) * rr, 0.05, Math.sin(ang) * rr, Math.cos(ang) * 4, 0.7 + Math.random(), Math.sin(ang) * 4);
      }
    }
    return { x: x, y: y, vx: vx };
  }

  /* ---------- camera rig: cinematic shots + manual override ---------- */
  var cam = { azO: 0, elO: 0, zoom: 1, cinema: true, dragging: false, idle: 0, fzAz: 0.7, fzEl: 0.2, fzD: 10 };
  var camTarget = new THREE.Vector3(-44, 1, 0), lx = 0, ly = 0;
  if (!EMBED) {
    canvas.addEventListener('pointerdown', function (e) { cam.dragging = true; cam.idle = 0; lx = e.clientX; ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
    canvas.addEventListener('pointermove', function (e) {
      if (!cam.dragging) return;
      cam.azO -= (e.clientX - lx) * 0.006; cam.elO += (e.clientY - ly) * 0.004; cam.idle = 0;
      lx = e.clientX; ly = e.clientY;
    });
    var endDrag = function () { cam.dragging = false; };
    canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.001), 0.45, 2.4); cam.idle = 0; }, { passive: false });
  }

  /* ---------- UI ---------- */
  var tag = $('modeTag'), desc = $('modeDesc'), bar = $('bar'), fadeEl = $('fade');
  function setHud(m) { var M = MODES[m]; tag.textContent = M.tag; tag.style.background = M.color; desc.textContent = M.desc; }
  var btns = document.querySelectorAll('.controls button[data-m]');
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(btns, function (o) { o.classList.remove('on'); });
      b.classList.add('on');
      seg = SEGS[b.getAttribute('data-m')]; tl = seg[0]; fading = false; fadeEl.style.opacity = 0; snapCam = true;
    });
  });
  $('cine').addEventListener('click', function () {
    cam.cinema = !cam.cinema; this.classList.toggle('on', cam.cinema);
    if (!cam.cinema) { cam.fzAz = keyInterp(CT, CAZ, tl) + cam.azO; cam.fzEl = keyInterp(CT, CEL, tl) + cam.elO; cam.fzD = keyInterp(CT, CD, tl); }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean'); });
  window.addEventListener('message', function (e) { if (e.data === 'tx-pause') paused = true; if (e.data === 'tx-play') paused = false; });

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  /* ---------- main loop ---------- */
  var last = performance.now(), frame = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (paused) return;
    animT += dt; frame++;

    if (!fading) {
      tl += dt;
      if (tl > seg[1]) {
        fading = true; tl = seg[1]; fadeEl.style.opacity = 1;
        setTimeout(function () { tl = seg[0]; fadeEl.style.opacity = 0; fading = false; snapCam = true; }, 480);
      }
    }

    var st = applyPose(tl, dt);
    var mi = modeIndex(tl); if (mi !== curMode) { curMode = mi; setHud(mi); }
    bar.style.width = (clamp((tl - seg[0]) / (seg[1] - seg[0]), 0, 1) * 100).toFixed(1) + '%';

    /* water surface and colour (every second frame) */
    if (frame % 2 === 0) {
      var pos = waterGeo.attributes.position;
      for (var n = 0; n < wCount; n++) {
        var gx = pos.getX(n), gy = pos.getY(n);
        var h = 0.07 * Math.sin(gx * 0.35 + animT * 1.2) + 0.05 * Math.sin(gy * 0.5 + animT * 0.9) + 0.03 * Math.sin((gx + gy) * 0.9 + animT * 1.7);
        pos.setZ(n, h);
        cTmp.copy(cDeep).lerp(cCrest, clamp((h + 0.1) / 0.2, 0, 1));
        wCols[n * 3] = cTmp.r; wCols[n * 3 + 1] = cTmp.g; wCols[n * 3 + 2] = cTmp.b;
      }
      pos.needsUpdate = true; waterGeo.attributes.color.needsUpdate = true; waterGeo.computeVertexNormals();
    }
    buoys.forEach(function (b) { b.position.set(b.userData.x, waveAt(b.userData.x, b.userData.z, animT) + 0.12, b.userData.z); });
    clouds.forEach(function (c) { c.position.x += dt * 0.6; if (c.position.x > 200) c.position.x = -90; });
    stepSpray(dt);

    /* camera */
    var az, el, dist;
    cam.idle += dt;
    if (cam.cinema) {
      if (!cam.dragging && cam.idle > 2.5) { var dec = Math.min(1, dt * 0.8); cam.azO -= cam.azO * dec; cam.elO -= cam.elO * dec; }
      az = keyInterp(CT, CAZ, tl) + cam.azO + 0.03 * Math.sin(animT * 0.45);
      el = keyInterp(CT, CEL, tl) + cam.elO + 0.012 * Math.sin(animT * 0.7);
      dist = keyInterp(CT, CD, tl);
    } else { az = cam.fzAz + cam.azO; el = cam.fzEl + cam.elO; dist = cam.fzD; }
    el = clamp(el, 0.04, 1.4);
    dist *= cam.zoom * (camera.aspect < 0.9 ? 1.35 : 1);

    var k = snapCam ? 1 : Math.min(1, dt * 3.5); snapCam = false;
    camTarget.x += (st.x + 0.9 - camTarget.x) * k;
    camTarget.y += (st.y + 0.3 - camTarget.y) * k;
    camTarget.z += (0 - camTarget.z) * k;
    var ce = Math.cos(el);
    camera.position.set(camTarget.x + Math.cos(az) * ce * dist, camTarget.y + Math.sin(el) * dist, camTarget.z + Math.sin(az) * ce * dist);
    camera.position.y = Math.max(camera.position.y, 0.9);
    camera.lookAt(camTarget);

    skyGroup.position.copy(camera.position);
    sun.target.position.copy(camTarget);
    sun.position.set(camTarget.x + 24, camTarget.y + 34, camTarget.z + 16);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
})();
