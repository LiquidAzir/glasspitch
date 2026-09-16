/* Original procedural stadium art. Built once; no shadow maps, downloads or game RNG. */
window.PitchArt = (() => {
  // These meshes share the existing animation pivots. Facet lighting is baked
  // once into vertex colors; instanced skin/team colors still tint each player.
  function loft(T,rows) {
    const p=[],uv=[],rings=rows.map(([y,w,d,ox=0,oz=0])=>{w/=2;d/=2;const b=Math.min(w,d)*.34;return[[-w,-d+b],[-w+b,-d],[w-b,-d],[w,-d+b],[w,d-b],[w-b,d],[-w+b,d],[-w,d-b]].map(([x,z])=>[x+ox,y,z+oz]);});
    const low=rows[0][0],high=rows[rows.length-1][0],wide=Math.max(...rows.map(r=>r[1]));
    const tri=(a,b,c)=>{p.push(...a,...b,...c);for(const v of[a,b,c])uv.push(.5+v[0]/wide,(v[1]-low)/(high-low||1));};
    for(let k=0;k<rings.length-1;k++)for(let i=0;i<8;i++){const j=(i+1)%8;tri(rings[k][i],rings[k+1][i],rings[k+1][j]);tri(rings[k][i],rings[k+1][j],rings[k][j]);}
    for(let i=0;i<8;i++){const j=(i+1)%8;tri([rows[0][3]||0,low,rows[0][4]||0],rings[0][i],rings[0][j]);tri([rows[rows.length-1][3]||0,high,rows[rows.length-1][4]||0],rings[rings.length-1][j],rings[rings.length-1][i]);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
  }
  function shaded(T,parts) {
    const p=[],c=[],uv=[];
    for(const entry of parts){const g=entry.g.index?entry.g.toNonIndexed():entry.g,pos=g.attributes.position,n=g.attributes.normal,tex=g.attributes.uv,tint=entry.tint==null?1:entry.tint;
      for(let i=0;i<pos.count;i++){p.push(pos.getX(i),pos.getY(i),pos.getZ(i));const shade=Math.max(.52,Math.min(1.08,.80+n.getY(i)*.23+n.getZ(i)*.10-n.getX(i)*.13))*tint;c.push(shade,shade,shade);uv.push(tex?tex.getX(i):.5,tex?tex.getY(i):.5);}
      if(g!==entry.g)g.dispose();entry.g.dispose();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;
  }
  function playerGeometry(T) {
    const body=rows=>({g:loft(T,rows)}),box=(w,h,d,x,y,z,tint=1)=>({g:new T.BoxGeometry(w,h,d).translate(x,y,z),tint});
    return {
      torso:shaded(T,[body([[1.48,.61,.38],[1.67,.73,.43],[2.25,.96,.51],[2.43,.83,.45],[2.52,.32,.27]])]),
      shorts:shaded(T,[-1,1].map(side=>body([[1.19,.38,.43,side*.21],[1.40,.42,.48,side*.20],[1.61,.40,.43,side*.19]]))),
      head:shaded(T,[body([[2.48,.27,.33],[2.65,.61,.54],[3.04,.71,.58],[3.20,.46,.42]]),
        body([[2.76,.12,.10,0,.29],[2.91,.14,.16,0,.32],[2.98,.07,.08,0,.29]]),
        box(.095,.045,.028,-.16,2.96,.287,.075),box(.095,.045,.028,.16,2.96,.287,.075),
        box(.09,.19,.14,-.38,2.85,0,.9),box(.09,.19,.14,.38,2.85,0,.9)]),
      hair:shaded(T,[body([[3.00,.74,.61],[3.18,.65,.51],[3.28,.29,.30]])]),
      leg:shaded(T,[body([[-1.38,.26,.28],[-.77,.23,.25],[-.57,.28,.28],[-.08,.32,.34],[0,.27,.29]])]),
      arm:shaded(T,[body([[-1.00,.22,.22,0,.035],[-.79,.18,.20],[-.46,.20,.23],[-.05,.27,.29],[.02,.21,.22]])]),
      sock:shaded(T,[body([[-1.27,.28,.29],[-.91,.27,.28],[-.70,.30,.30]])]),
      boot:shaded(T,[body([[-1.40,.31,.61,0,.12],[-1.34,.34,.65,0,.12],[-1.23,.32,.53,0,.13],[-1.18,.27,.35,0,.03]])]),
      sleeve:shaded(T,[body([[-.38,.31,.33],[-.20,.39,.42],[.04,.42,.44]])]),
    };
  }
  function playerMaterials(T,side) {
    const flat=color=>new T.MeshBasicMaterial({color,vertexColors:true});
    const kit=flat(0xffffff);kit.map=badgeTexture(T,side==='home'?9:7);
    return{kit,shorts:flat(0xffffff),hair:flat(0x493b34),socks:flat(0xf5eee0),boots:flat(0x435167)};
  }
  function ballGeometry(T) {return shaded(T,[{g:new T.SphereGeometry(1,14,10)}]);}
  function ballTexture(T) {
    const w=256,h=128,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff8df';x.fillRect(0,0,w,h);
    const phi=(1+Math.sqrt(5))/2,points=[[0,1,phi],[0,-1,phi],[0,1,-phi],[0,-1,-phi],[1,phi,0],[-1,phi,0],[1,-phi,0],[-1,-phi,0],[phi,0,1],[-phi,0,1],[phi,0,-1],[-phi,0,-1]];
    for(const [a,b,z] of points){const l=Math.hypot(a,b,z),v=Math.acos(b/l)/Math.PI,u=Math.atan2(z,a)/(Math.PI*2)+.5;for(const wrap of[-1,0,1]){x.save();x.translate((u+wrap)*w,v*h);x.scale(1/Math.max(.42,Math.sin(v*Math.PI)),1);x.beginPath();for(let i=0;i<5;i++){const angle=-Math.PI/2+i*Math.PI*2/5;(i?x.lineTo:x.moveTo).call(x,Math.cos(angle)*12,Math.sin(angle)*12);}x.closePath();x.fillStyle='#152334';x.fill();x.strokeStyle='#81929a';x.lineWidth=1;x.stroke();x.restore();}}
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
  }
  function grass(ctx,w,h) {
    const light=ctx.createLinearGradient(0,0,w,h);
    light.addColorStop(0,'#356f46');light.addColorStop(.5,'#224e33');light.addColorStop(1,'#153d2b');
    ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
    for(let row=0;row<14;row++){ctx.fillStyle=row%2?'rgba(159,205,95,.085)':'rgba(2,21,18,.08)';ctx.fillRect(0,row*h/14,w,h/14+1);}
    // Local deterministic texture noise must never consume the simulation PRNG.
    let seed=7193;const r=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<12500;i++){const x=r()*w,y=r()*h;ctx.fillStyle=i%2?'rgba(188,220,130,.08)':'rgba(2,25,14,.09)';ctx.fillRect(x,y,1+r()*2,1+r()*4);}
    ctx.strokeStyle='rgba(200,223,146,.07)';ctx.lineWidth=3;for(let x=12;x<w;x+=29){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    // Worn goalmouths, a quiet centre wear ring, and edge chalk shoulders.
    for(const y of [10,h-10]){const g=ctx.createRadialGradient(w/2,y,0,w/2,y,95);g.addColorStop(0,'rgba(182,150,91,.15)');g.addColorStop(1,'rgba(182,150,91,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
  }
  function badgeTexture(T,number) {
    const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,128,128);
    // Readable at match distance: home uses a chest band, away a diagonal sash.
    // Avoid repeating a fictitious shirt number across the entire squad.
    x.fillStyle='#4d6069';if(number===9){x.fillRect(0,42,128,18);x.fillRect(0,67,128,5);}else{x.beginPath();x.moveTo(0,8);x.lineTo(26,0);x.lineTo(128,100);x.lineTo(128,128);x.closePath();x.fill();}
    x.fillStyle='#bbc8ce';x.fillRect(0,0,10,128);x.fillRect(118,0,10,128);
    x.fillStyle='#253942';x.beginPath();x.moveTo(41,0);x.lineTo(64,23);x.lineTo(87,0);x.closePath();x.fill();
    x.fillStyle='#f2e5bc';x.fillRect(83,24,12,15);x.fillStyle='#607780';x.fillRect(87,27,4,9);
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
  }
  function stadium(T,scene) {
    const flat=c=>new T.MeshBasicMaterial({color:c,vertexColors:true});
    const stone=flat(0x24333d),edge=flat(0x46616a),walk=flat(0x15232a),white=flat(0xb3d6d5),gold=flat(0xd1b869);
    const batches=new Map();
    const box=(x,y,z,w,h,d,mat)=>{if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push([x,y,z,w,h,d]);};
    // Visible cut slab and apron ground the pitch, with a low open near side.
    box(0,-1.1,0,98,2,115,stone);box(0,-.16,0,96,.25,113,walk);
    for(const z of [-57,57]){box(0,.32,z,97,.48,.36,white);box(0,-.5,z,97,.14,.4,gold);}
    for(const x of [-48,48]){box(x,.3,0,.36,.48,114,white);box(x,-.5,0,.4,.14,114,gold);}
    // Back stand and short end stands; all below the play silhouettes.
    for(let row=0;row<4;row++){
      box(51+row*2.5,.75+row*.7,0,2.6,1.3,116,stone);
      for(const z of [-60-row*2.25,60+row*2.25])box(5,.5+row*.55,z,90,1.1,2.3,stone);
    }
    const dummy=new T.Object3D(),positions=[];
    for(let row=0;row<4;row++)for(let i=0;i<67;i++){if(i%17===0)continue;positions.push([51+row*2.5,1.65+row*.7,-55+i*1.65]);}
    for(const end of [-1,1])for(let row=0;row<4;row++)for(let i=0;i<48;i++){if(i%16===0)continue;positions.push([-37+i*1.75,1.35+row*.55,end*(60+row*2.25)]);}
    const crowd=new T.InstancedMesh(shaded(T,[{g:new T.BoxGeometry(.8,.74,.88)}]),flat(0xffffff),positions.length);
    const cols=[0x3d7682,0x9baeb2,0x38555d,0x4e8990,0xb7a479,0x273f4e];
    positions.forEach((p,i)=>{dummy.position.set(...p);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);crowd.setColorAt(i,new T.Color(cols[(i*7+Math.floor(i/13))%cols.length]));});scene.add(crowd);
    // Recessed club ribbon; a single atlas, not individual text meshes.
    const c=document.createElement('canvas');c.width=1024;c.height=64;const x=c.getContext('2d');x.fillStyle='#1d4148';x.fillRect(0,0,1024,64);x.fillStyle='#bdddd9';x.font='700 25px system-ui';x.textAlign='center';for(let i=0;i<4;i++)x.fillText(i%2?'THE BEAUTIFUL GAME':'GLASS PITCH',128+i*256,42);x.fillStyle='#d2b56b';x.fillRect(0,0,1024,4);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    const ribbon=new T.Mesh(new T.PlaneGeometry(110,1.9),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));ribbon.position.set(49.8,1.2,0);ribbon.rotation.y=-Math.PI/2;scene.add(ribbon);
    // Corner flags and benches remain inside the apron, beyond the field of play.
    for(const x of [-44.7,44.7])for(const z of [-53.2,53.2]){box(x,1.3,z,.11,2.6,.11,white);box(x+.52,2.36,z,1,.55,.06,gold);}
    for(const z of [-17,17]){box(-46.2,.7,z,1.5,1.1,8,stone);box(-46.2,1.4,z,2,.18,8,edge);}
    const slab=shaded(T,[{g:new T.BoxGeometry(1,1,1)}]);
    for(const [mat,rows] of batches){const mesh=new T.InstancedMesh(slab,mat,rows.length);rows.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3],p[4],p[5]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});scene.add(mesh);}
    return {crowd};
  }
  const miniCache=new Map();
  function miniPitch(ctx,horizon){
    if(!miniCache.has(horizon)){const c=document.createElement('canvas');c.width=c.height=600;const x=c.getContext('2d');
      x.fillStyle='#14272f';x.fillRect(42,horizon-166,516,165);for(let row=0;row<5;row++)for(let i=0;i<64;i++){x.fillStyle=['#476e79','#9aa899','#263e49'][(i*7+row)%3];x.fillRect(46+i*8,horizon-161+row*13,5,5);}x.fillStyle='#10232c';x.fillRect(45,horizon-88,510,88);
      const g=x.createLinearGradient(0,horizon,0,522);g.addColorStop(0,'#234a35');g.addColorStop(1,'#173e2c');x.fillStyle=g;x.beginPath();x.moveTo(65,horizon);x.lineTo(535,horizon);x.lineTo(594,522);x.lineTo(6,522);x.closePath();x.fill();
      for(let i=0;i<7;i++){const y=horizon+(522-horizon)*i/7,w=235+(y-horizon)*.23;x.fillStyle=i%2?'#ffffff05':'#041c0b0c';x.beginPath();x.moveTo(300-w,y);x.lineTo(300+w,y);x.lineTo(300+w+10,y+(522-horizon)/7);x.lineTo(300-w-10,y+(522-horizon)/7);x.closePath();x.fill();}
      x.strokeStyle='#a9c8b1';x.lineWidth=1.5;x.beginPath();x.moveTo(65,horizon);x.lineTo(6,522);x.moveTo(535,horizon);x.lineTo(594,522);x.moveTo(119,horizon);x.lineTo(75,horizon+125);x.lineTo(525,horizon+125);x.lineTo(481,horizon);x.stroke();miniCache.set(horizon,c);
    }ctx.drawImage(miniCache.get(horizon),0,0);
  }
  return {grass,stadium,badgeTexture,miniPitch,playerGeometry,playerMaterials,ballGeometry,ballTexture};
})();
