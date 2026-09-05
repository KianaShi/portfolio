(function(){
  var ctx = window.__ctx;
  var scene = ctx.scene;
  var screenMat = ctx.screenMat;
  // our own procedural room shell — hidden once the purchased model's own
  // Room/Window/day-backdrop loads successfully (kept as a fallback until then)
  var roomCluster = ctx.roomCluster = [];

  // back wall
  var backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.MeshStandardMaterial({color:0x12141c, roughness:1})
  );
  backWall.position.set(0, 2, -0.6);
  scene.add(backWall);
  roomCluster.push(backWall);

  // right wall (cool ambient)
  var rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({color:0x141a24, roughness:1})
  );
  rightWall.rotation.y = -Math.PI/2;
  rightWall.position.set(6.5, 2, 0);
  scene.add(rightWall);
  roomCluster.push(rightWall);

  // window backlight (blinds glow source)
  var windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 3.6),
    new THREE.MeshStandardMaterial({color:0x8fb4d9, emissive:0x8fb4d9, emissiveIntensity:1.0, roughness:1})
  );
  windowGlow.position.set(2.6, 2.4, -0.5);
  scene.add(windowGlow);
  roomCluster.push(windowGlow);

  // blinds
  var blindsGroup = new THREE.Group();
  var blindMat = new THREE.MeshStandardMaterial({color:0x141414, roughness:0.8, metalness:0.1});
  for (var i=0; i<22; i++){
    var bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.11, 0.05), blindMat);
    bar.position.set(2.6, 0.7 + i*0.165, -0.4);
    blindsGroup.add(bar);
  }
  scene.add(blindsGroup);
  roomCluster.push(blindsGroup);

  // desk-top props that get hidden once the real desk.obj accessories load
  // (desk itself and the CRT monitor stay — the monitor is the interactive boot screen)
  var deskCluster = ctx.deskCluster = [];

  var deskMat = new THREE.MeshStandardMaterial({color:0x181c24, roughness:0.55});
  var desk = ctx.desk = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.14, 1.9), deskMat);
  desk.position.set(0.3, -0.85, 0.4);
  scene.add(desk);

  // shared procedural "plastic" texture (subtle noise + sheen) for the cream housings
  var plasticCanvas = document.createElement('canvas');
  plasticCanvas.width = 64; plasticCanvas.height = 64;
  var plctx = plasticCanvas.getContext('2d');
  plctx.fillStyle = '#d8d3c6';
  plctx.fillRect(0, 0, 64, 64);
  for (var pn=0; pn<500; pn++){
    var pnx = Math.random()*64, pny = Math.random()*64;
    var pshade = Math.random()*16 - 8;
    plctx.fillStyle = 'rgba(' + Math.round(216+pshade) + ',' + Math.round(211+pshade) + ',' + Math.round(198+pshade) + ',0.5)';
    plctx.fillRect(pnx, pny, 1, 1);
  }
  var plasticSheen = plctx.createLinearGradient(0, 0, 64, 64);
  plasticSheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  plasticSheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  plasticSheen.addColorStop(1, 'rgba(0,0,0,0.06)');
  plctx.fillStyle = plasticSheen;
  plctx.fillRect(0, 0, 64, 64);
  var plasticTex = new THREE.CanvasTexture(plasticCanvas);
  plasticTex.wrapS = plasticTex.wrapT = THREE.RepeatWrapping;
  plasticTex.repeat.set(3, 3);

  // speaker grille texture (perforated dot-matrix mesh)
  var grilleCanvas = document.createElement('canvas');
  grilleCanvas.width = 64; grilleCanvas.height = 64;
  var grctx = grilleCanvas.getContext('2d');
  grctx.fillStyle = '#1c1c1c'; grctx.fillRect(0, 0, 64, 64);
  grctx.fillStyle = '#050505';
  for (var ggy=2; ggy<64; ggy+=6){
    for (var ggx=2; ggx<64; ggx+=6){
      grctx.beginPath(); grctx.arc(ggx, ggy, 1.4, 0, Math.PI*2); grctx.fill();
    }
  }
  var grilleTex = new THREE.CanvasTexture(grilleCanvas);

  // monitor group (retro all-in-one)
  var monitor = ctx.monitor = new THREE.Group();
  var creamMat = new THREE.MeshStandardMaterial({map:plasticTex, color:0xffffff, roughness:0.55});
  var body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.3, 1.15), creamMat);
  monitor.add(body);
  var base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.95), creamMat);
  base.position.set(0, -0.82, 0.05);
  monitor.add(base);
  var bezel = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 1.14, 0.06),
    creamMat
  );
  bezel.position.set(0, -0.01, 0.585);
  monitor.add(bezel);

  // dark inset frame right around the glass
  var screenBorder = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.9, 0.02),
    new THREE.MeshStandardMaterial({color:0x0a0e10, roughness:0.4})
  );
  screenBorder.position.set(0, 0.06, 0.617);
  monitor.add(screenBorder);

  // control button strip below the screen
  var ctrlBtnMat = new THREE.MeshStandardMaterial({color:0x2a2a2a, roughness:0.6});
  var ctrlBtnXs = [-0.42, -0.32, -0.22, -0.1, 0.02, 0.14];
  for (var cbi=0; cbi<ctrlBtnXs.length; cbi++){
    var ctrlBtn = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.015), ctrlBtnMat);
    ctrlBtn.position.set(ctrlBtnXs[cbi], -0.47, 0.619);
    monitor.add(ctrlBtn);
  }
  var powerBtn = ctx.powerBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.016, 16),
    new THREE.MeshStandardMaterial({color:0x1a1a1a, emissive:0xd9483c, emissiveIntensity:0.5, roughness:0.5})
  );
  powerBtn.rotation.x = Math.PI/2;
  powerBtn.position.set(0.5, -0.47, 0.619);
  monitor.add(powerBtn);

  // brand plate
  var brandPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.03, 0.01),
    new THREE.MeshStandardMaterial({color:0xb8b2a0, roughness:0.5})
  );
  brandPlate.position.set(-0.42, 0.42, 0.619);
  monitor.add(brandPlate);

  var screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.82), screenMat);
  screenMesh.position.set(0, 0.06, 0.62);
  screenMesh.name = 'SCREEN';
  monitor.add(screenMesh);

  // mutable refs so the interaction can be rebound to the purchased desk model's
  // own monitor once it loads — starts out pointing at the CRT as a fallback.
  ctx.interactiveScreen = screenMesh;
  ctx.interactiveHitbox = screenMesh;

  monitor.position.set(0.3, 0.05, 0.55);
  scene.add(monitor);

  // speakers flanking the monitor
  var speakerMat = new THREE.MeshStandardMaterial({map:plasticTex, color:0xffffff, roughness:0.6});
  var grilleMat = new THREE.MeshStandardMaterial({map:grilleTex, roughness:0.9});
  var speakerXs = [-0.65, 1.25];
  for (var sIdx=0; sIdx<speakerXs.length; sIdx++){
    var sx = speakerXs[sIdx];
    var spk = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), speakerMat);
    spk.position.set(sx, -0.61, 0.8);
    scene.add(spk);
    deskCluster.push(spk);
    var grille = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), grilleMat);
    grille.position.set(sx, -0.58, 0.921);
    scene.add(grille);
    deskCluster.push(grille);
  }

  // PC tower (right of the monitor)
  var towerMat = new THREE.MeshStandardMaterial({map:plasticTex, color:0xffffff, roughness:0.6});
  var tower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.05, 0.85), towerMat);
  tower.position.set(1.9, -0.255, 0.3);
  scene.add(tower);
  deskCluster.push(tower);

  var bayMat = new THREE.MeshStandardMaterial({color:0x1c1a1a, roughness:0.7});
  for (var db=0; db<2; db++){
    var bay = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), bayMat);
    bay.position.set(1.9, 0.15 - db*0.11, 0.727);
    scene.add(bay);
    deskCluster.push(bay);
  }
  var towerLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 8, 8),
    new THREE.MeshStandardMaterial({color:0x3fe08a, emissive:0x3fe08a, emissiveIntensity:1.5})
  );
  towerLed.position.set(1.72, -0.15, 0.727);
  scene.add(towerLed);
  deskCluster.push(towerLed);

  // keyboard
  var keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.07, 0.42),
    new THREE.MeshStandardMaterial({map:plasticTex, color:0xffffff, roughness:0.6})
  );
  keyboard.position.set(0.3, -0.74, 1.05);
  scene.add(keyboard);
  deskCluster.push(keyboard);

  // keycap grid overlay (procedural texture, cheaper than modeling individual keys)
  var keysCanvas = document.createElement('canvas');
  keysCanvas.width = 260; keysCanvas.height = 84;
  var kctx = keysCanvas.getContext('2d');
  kctx.fillStyle = '#c7c2b4'; kctx.fillRect(0, 0, 260, 84);
  kctx.fillStyle = '#a39d8c';
  for (var ky=6; ky<80; ky+=15){
    for (var kx=6; kx<254; kx+=15){
      kctx.fillRect(kx, ky, 11, 11);
    }
  }
  var keysTex = new THREE.CanvasTexture(keysCanvas);
  var keysOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(1.26, 0.4),
    new THREE.MeshStandardMaterial({map:keysTex, roughness:0.7})
  );
  keysOverlay.rotation.x = -Math.PI/2;
  keysOverlay.position.set(0.3, -0.704, 1.05);
  scene.add(keysOverlay);
  deskCluster.push(keysOverlay);

  // mouse
  var mouseBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 12),
    new THREE.MeshStandardMaterial({map:plasticTex, color:0xffffff, roughness:0.5})
  );
  mouseBody.scale.set(1, 0.55, 1.5);
  mouseBody.position.set(1.0, -0.7305, 1.0);
  scene.add(mouseBody);
  deskCluster.push(mouseBody);

  var mouseSplit = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, 0.01, 0.16),
    new THREE.MeshStandardMaterial({color:0x2a2a2a, roughness:0.6})
  );
  mouseSplit.position.set(1.0, -0.68, 1.0);
  scene.add(mouseSplit);
  deskCluster.push(mouseSplit);

  // mug
  var mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.11, 0.22, 16),
    new THREE.MeshStandardMaterial({color:0x3a3f4a, roughness:0.5})
  );
  mug.position.set(-1.05, -0.66, 0.85);
  scene.add(mug);
  deskCluster.push(mug);

  // wall shelves (left side)
  var shelfMat = new THREE.MeshStandardMaterial({color:0xc9a876, roughness:0.7});
  var topShelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.3), shelfMat);
  topShelf.position.set(-3.05, 1.75, -0.5);
  scene.add(topShelf);
  roomCluster.push(topShelf);
  var bottomShelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.3), shelfMat);
  bottomShelf.position.set(-3.05, 1.05, -0.5);
  scene.add(bottomShelf);
  roomCluster.push(bottomShelf);

  // book spines standing on the top shelf
  var spineColors = [0x8a3b2b, 0x2b6b63, 0xc9a227, 0x3a5f8a, 0x6a4a8a];
  var spineHeights = [0.3, 0.34, 0.28, 0.32, 0.29];
  for (var s=0; s<5; s++){
    var spineH = spineHeights[s];
    var spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, spineH, 0.24),
      new THREE.MeshStandardMaterial({color:spineColors[s], roughness:0.7})
    );
    spine.position.set(-3.62 + s*0.09, 1.775 + spineH/2, -0.5);
    scene.add(spine);
    roomCluster.push(spine);
  }

  // small bin on the top shelf
  var bin = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.22, 0.22),
    new THREE.MeshStandardMaterial({color:0xd8d3c6, roughness:0.8})
  );
  bin.position.set(-2.55, 1.885, -0.45);
  scene.add(bin);
  roomCluster.push(bin);

  // mini potted plant on the bottom shelf
  var miniPot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.05, 0.09, 10),
    new THREE.MeshStandardMaterial({color:0xc9a876, roughness:0.8})
  );
  miniPot.position.set(-3.6, 1.12, -0.45);
  scene.add(miniPot);
  roomCluster.push(miniPot);
  for (var ml=0; ml<5; ml++){
    var mleaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.16, 6),
      new THREE.MeshStandardMaterial({color:0x4a8a5c, roughness:0.7})
    );
    mleaf.position.set(-3.6 + Math.cos(ml)*0.03, 1.19 + Math.random()*0.04, -0.45 + Math.sin(ml)*0.03);
    mleaf.rotation.z = (Math.random()-0.5)*0.5;
    scene.add(mleaf);
    roomCluster.push(mleaf);
  }

  // a couple books lying flat on the bottom shelf
  var flatColors = [0x6a4a8a, 0xb08a2c];
  for (var fb=0; fb<2; fb++){
    var flatBook = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.045, 0.22),
      new THREE.MeshStandardMaterial({color:flatColors[fb], roughness:0.7})
    );
    flatBook.position.set(-3.1, 1.075 + 0.0225 + fb*0.045, -0.45);
    scene.add(flatBook);
    roomCluster.push(flatBook);
  }

  // circular pinboard with pinned notes
  var pinboard = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshStandardMaterial({color:0xc9a876, roughness:0.9})
  );
  pinboard.position.set(-1.85, 1.9, -0.53);
  scene.add(pinboard);
  roomCluster.push(pinboard);

  var pinColors = [0xe8d97a, 0x9fc3e0, 0xd98a6a];
  for (var p=0; p<3; p++){
    var pin = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.2),
      new THREE.MeshStandardMaterial({color:pinColors[p], roughness:0.9})
    );
    var ang = p*2.1;
    pin.position.set(-1.85 + Math.cos(ang)*0.22, 1.9 + Math.sin(ang)*0.18, -0.51);
    pin.rotation.z = (Math.random()-0.5)*0.3;
    scene.add(pin);
    roomCluster.push(pin);
  }

  // small to-do / calendar board (procedural canvas texture)
  var boardCanvas = document.createElement('canvas');
  boardCanvas.width = 200; boardCanvas.height = 150;
  var bctx = boardCanvas.getContext('2d');
  bctx.fillStyle = '#1c2430'; bctx.fillRect(0, 0, 200, 150);
  bctx.strokeStyle = 'rgba(255,255,255,0.22)'; bctx.lineWidth = 1;
  for (var gx=0; gx<=200; gx+=40){
    bctx.beginPath(); bctx.moveTo(gx, 22); bctx.lineTo(gx, 150); bctx.stroke();
  }
  for (var gy=22; gy<=150; gy+=26){
    bctx.beginPath(); bctx.moveTo(0, gy); bctx.lineTo(200, gy); bctx.stroke();
  }
  bctx.fillStyle = '#e9e6dc'; bctx.font = '14px sans-serif'; bctx.fillText('TO DO', 8, 15);
  var boardTex = new THREE.CanvasTexture(boardCanvas);
  var calBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.64),
    new THREE.MeshStandardMaterial({map:boardTex, roughness:1})
  );
  calBoard.position.set(-1.9, 1.05, -0.52);
  scene.add(calBoard);
  roomCluster.push(calBoard);

  // desk plant (left side, behind the monitor)
  var deskPlant = new THREE.Group();
  var deskPot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.08, 0.16, 10),
    new THREE.MeshStandardMaterial({color:0x3a3a3a, roughness:0.7})
  );
  deskPlant.add(deskPot);
  for (var dl=0; dl<6; dl++){
    var dleaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.32, 6),
      new THREE.MeshStandardMaterial({color:0x4a8a5c, roughness:0.7})
    );
    dleaf.position.set(Math.cos(dl)*0.05, 0.2 + Math.random()*0.08, Math.sin(dl)*0.05);
    dleaf.rotation.z = (Math.random()-0.5)*0.6;
    deskPlant.add(dleaf);
  }
  deskPlant.position.set(-0.7, -0.7, -0.35);
  scene.add(deskPlant);
  deskCluster.push(deskPlant);

  var deskPlantLight = new THREE.PointLight(0x8fb8c4, 0.4, 2.5, 2);
  deskPlantLight.position.set(-0.7, -0.2, 0.1);
  scene.add(deskPlantLight);

  // window light spilling onto the desk (cool glow + blind-stripe shadow)
  var deskWarmLight = new THREE.PointLight(0x8fb4d9, 0.6, 4, 2);
  deskWarmLight.position.set(1.9, -0.3, -0.6);
  scene.add(deskWarmLight);

  var deskGlowCanvas = document.createElement('canvas');
  deskGlowCanvas.width = 128; deskGlowCanvas.height = 128;
  var gctx = deskGlowCanvas.getContext('2d');
  var deskGlowGrad = gctx.createRadialGradient(110, 20, 4, 110, 20, 130);
  deskGlowGrad.addColorStop(0, 'rgba(143,180,217,0.5)');
  deskGlowGrad.addColorStop(0.5, 'rgba(143,180,217,0.2)');
  deskGlowGrad.addColorStop(1, 'rgba(143,180,217,0)');
  gctx.fillStyle = deskGlowGrad;
  gctx.fillRect(0, 0, 128, 128);
  gctx.globalCompositeOperation = 'destination-out';
  for (var sy=0; sy<128; sy+=11){
    gctx.fillStyle = 'rgba(0,0,0,0.35)';
    gctx.fillRect(0, sy, 128, 4);
  }
  gctx.globalCompositeOperation = 'source-over';
  var deskGlowTex = new THREE.CanvasTexture(deskGlowCanvas);
  var deskGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.4),
    new THREE.MeshBasicMaterial({map:deskGlowTex, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false})
  );
  deskGlow.rotation.x = -Math.PI/2;
  deskGlow.position.set(1.9, -0.775, -0.05);
  scene.add(deskGlow);
  deskCluster.push(deskGlow);

  // plant (right side, near window)
  var plantGroup = new THREE.Group();
  var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.14,0.25,10), new THREE.MeshStandardMaterial({color:0x2a2a2a}));
  plantGroup.add(pot);
  for (var l=0; l<6; l++){
    var leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.5, 6),
      new THREE.MeshStandardMaterial({color:0x2f5c3a, roughness:0.8})
    );
    leaf.position.set(Math.cos(l)*0.08, 0.35 + Math.random()*0.15, Math.sin(l)*0.08);
    leaf.rotation.z = (Math.random()-0.5)*0.6;
    plantGroup.add(leaf);
  }
  plantGroup.position.set(4.3, -0.6, -1.4);
  scene.add(plantGroup);

})();
