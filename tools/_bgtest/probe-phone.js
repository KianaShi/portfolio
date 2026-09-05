// Throwaway probe — logs the real runtime phone node/mesh/material/UV structure.
(function(){
  var ctx = window.__ctx;
  var pollId = setInterval(function(){
    if (!ctx.scene) return;
    var found = null;
    ctx.scene.traverse(function(o){ if (/iphone/i.test(o.name)) { if (!found) found = []; found.push(o); } });
    if (!found) return;
    clearInterval(pollId);

    var report = { candidates: found.map(function(o){ return { name: o.name, type: o.type, childCount: o.children.length }; }) };

    // the actual phone root: the object with the most iphone-material children
    var root = found.reduce(function(best, o){ return (!best || o.children.length > best.children.length) ? o : best; }, null);
    report.rootName = root.name;
    report.rootChildren = root.children.map(function(c){
      return { name: c.name, isMesh: !!c.isMesh, material: c.material ? c.material.name : null, materialType: c.material ? c.material.type : null };
    });

    var screenMesh = root.children.find(function(c){ return c.material && c.material.name === 'screen'; });
    if (screenMesh) {
      screenMesh.updateMatrixWorld(true);
      var geo = screenMesh.geometry;
      geo.computeBoundingBox();
      var bb = geo.boundingBox;
      var uvAttr = geo.attributes.uv;
      var uMin=Infinity,uMax=-Infinity,vMin=Infinity,vMax=-Infinity;
      for (var i=0;i<uvAttr.count;i++){
        var u = uvAttr.getX(i), v = uvAttr.getY(i);
        if (u<uMin)uMin=u; if (u>uMax)uMax=u;
        if (v<vMin)vMin=v; if (v>vMax)vMax=v;
      }
      report.screenMesh = {
        name: screenMesh.name,
        materialName: screenMesh.material.name,
        materialType: screenMesh.material.type,
        mapPresent: !!screenMesh.material.map,
        localBBoxMin: bb.min.toArray(), localBBoxMax: bb.max.toArray(),
        uvRange: { uMin: uMin, uMax: uMax, vMin: vMin, vMax: vMax },
      };
      // world-space corners of local bbox -> project to screen pixels under idle camera
      var corners = [
        new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z),
      ].map(function(v){ return v.applyMatrix4(screenMesh.matrixWorld); });
      report.worldCorners = corners.map(function(v){ return v.toArray(); });

      ctx.camera.position.set(0, 1.05, 3.85);
      ctx.camera.lookAt(0.27, 0.97, 0.2);
      ctx.camera.updateMatrixWorld(true);
      ctx.camera.updateProjectionMatrix();
      var w = ctx.renderer.domElement.width, h = ctx.renderer.domElement.height;
      var screenPx = corners.map(function(v){
        var p = v.clone().project(ctx.camera);
        return [ Math.round((p.x*0.5+0.5)*w), Math.round((1-(p.y*0.5+0.5))*h) ];
      });
      report.screenPx = screenPx;
      var xs = screenPx.map(function(p){return p[0];}), ys = screenPx.map(function(p){return p[1];});
      report.screenPxBBox = { minX: Math.min.apply(null,xs), maxX: Math.max.apply(null,xs), minY: Math.min.apply(null,ys), maxY: Math.max.apply(null,ys) };
    } else {
      report.screenMesh = null;
    }

    window.__phoneProbe = report;
    console.log('[phoneprobe] ' + JSON.stringify(report));
  }, 200);
})();
