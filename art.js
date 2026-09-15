/* Original procedural stadium art. Built once; no shadow maps, downloads or game RNG. */
window.PitchArt = (() => {
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
    x.fillStyle='#fff';x.fillRect(0,0,128,128);x.fillStyle='#bccbc6';x.fillRect(12,0,14,128);x.fillRect(102,0,14,128);
    x.fillStyle='#263c40';x.fillRect(44,0,40,12);x.font='900 48px system-ui';x.textAlign='center';x.fillText(String(number),64,88);
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
  }
  function stadium(T,scene) {
    const flat=c=>new T.MeshBasicMaterial({color:c});
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
    const crowd=new T.InstancedMesh(new T.BoxGeometry(.8,.74,.88),flat(0xffffff),positions.length);
    const cols=[0x3d7682,0x9baeb2,0x38555d,0x4e8990,0xb7a479,0x273f4e];
    positions.forEach((p,i)=>{dummy.position.set(...p);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);crowd.setColorAt(i,new T.Color(cols[(i*7+Math.floor(i/13))%cols.length]));});scene.add(crowd);
    // Recessed club ribbon; a single atlas, not individual text meshes.
    const c=document.createElement('canvas');c.width=1024;c.height=64;const x=c.getContext('2d');x.fillStyle='#1d4148';x.fillRect(0,0,1024,64);x.fillStyle='#bdddd9';x.font='700 25px system-ui';x.textAlign='center';for(let i=0;i<4;i++)x.fillText(i%2?'THE BEAUTIFUL GAME':'GLASS PITCH',128+i*256,42);x.fillStyle='#d2b56b';x.fillRect(0,0,1024,4);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    const ribbon=new T.Mesh(new T.PlaneGeometry(110,1.9),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));ribbon.position.set(49.8,1.2,0);ribbon.rotation.y=-Math.PI/2;scene.add(ribbon);
    // Corner flags and benches remain inside the apron, beyond the field of play.
    for(const x of [-44.7,44.7])for(const z of [-53.2,53.2]){box(x,1.3,z,.11,2.6,.11,white);box(x+.52,2.36,z,1,.55,.06,gold);}
    for(const z of [-17,17]){box(-46.2,.7,z,1.5,1.1,8,stone);box(-46.2,1.4,z,2,.18,8,edge);}
    for(const [mat,rows] of batches){const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),mat,rows.length);rows.forEach((p,i)=>{dummy.position.set(p[0],p[1],p[2]);dummy.scale.set(p[3],p[4],p[5]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});scene.add(mesh);}
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
  return {grass,stadium,badgeTexture,miniPitch};
})();
