(function () {
  'use strict';
  const palette = {
    K:'#1b2528',W:'#ffffff',S:'#e5efe5',B:'#307aaf',b:'#1d567b',p:'#a9dcef',
    E:'#101617',h:'#e0b88a',N:'#202a2e',D:'#414c55',d:'#63717b',A:'#efa949',
    T:'#d89548',t:'#f4d18b',G:'#397d4e',g:'#6eb768',M:'#755037',C:'#f2ba36',
    O:'#e47d2a',o:'#ffefad',Y:'#f8d465',Q:'#ab691f',c:'#f0e4b9',Z:'#6b4e00',J:'#a87400',H:'#d9a400',L:'#f2c94c',V:'#fff4b0'
  };
  const hero = [
    '....KKKKKKKK....',
    '...KBBBBBBBBK...',
    '..KBBBBBBBBBBK..',
    '..KbbbbbbbbbbK..',
    '...KKKKKKKKKK...',
    '..KWWWWWWWWWWK..',
    '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.',
    '.KWWWEEWWEEWWWK.',
    '.KWWWEEWWEEWWWK.',
    '.KWWWWWhhWWWWWK.',
    '.KWWWWWhhWWWWWK.',
    '..KSSSSSSSSSSK..',
    '..KSSSSSSSSSSK..',
    '...KSSSSSSSSK...',
    '...KKKKKKKKKK...',
    '....KK....KK....',
    '....KK....KK....'
  ];
  const enemy = [
    '.....NNNNNN.....',
    '...NDDDDDDDDN...',
    '..NDDDDDDDDDDN..',
    '.NDDDDDDDDDDDDN.',
    '.NDDDDDddDDDDDN.',
    'NDDDDDDDDDDDDDDN',
    'NDDWWDDDDWWDDDDN',
    'NDDWENDDWENDDDDN',
    'NDDWWDDDDWWDDDDN',
    'NDDDDDAADDDDDDDN',
    'NDDDDDAADDDDDDDN',
    'NDDDDDDDDDDDDDDN',
    'NDDDDDDDDDDDDDDN',
    'NDDDDDDDDDDDDDDN',
    'NNDDNNDDNNDDNNNN',
    '.NNN..NN..NNNN..'
  ];
  const burger = [
    '......TTTT......',
    '....TTttttTT....',
    '..TTtttWttttTT..',
    '.TTttWttttWttTT.',
    '.TTttttttttttTT.',
    '.KKKKKKKKKKKKKK.',
    '.GGGGGGGGGGGGGG.',
    '.MMMMMMMMMMMMMM.',
    '.CCCCCCCCCCCCCC.',
    '.TTTTTTTTTTTTTT.',
    '..TTttttttttTT..',
    '...KKKKKKKKKK...'
  ];
  // 18x14: bigger than the standard burger, with actual metallic shadows/reflections.
  // Gold colors are exclusive to rare treasure; not used for health or warnings.
  const premium = [
    '.......JJJJ.......',
    '.....JHHHHHHJ.....',
    '...JHHLLVVLLHHJ...',
    '..JHLLVVLLVVLLHJ..',
    '.ZJHHLLLLLLHHHHJZ.',
    '.ZJHHHHHHHHHHHHJZ.',
    '.ZJJJJJJJJJJJJJJZ.',
    '..ZHHHHHHHHHHHHZ..',
    '..JLLVVLLVVLLVVJ..',
    '..ZJJJJJJJJJJJJZ..',
    '..ZHHLHHHHLHHHHZ..',
    '..ZJHHHHHHHHHHJZ..',
    '...ZJJLLLLLLJJZ...',
    '....ZZZZZZZZZZ....'
  ];
  const spriteCache = new WeakMap();
  function spriteCanvas(matrix,scale){
    let variants=spriteCache.get(matrix);
    if(!variants){variants=new Map();spriteCache.set(matrix,variants);}
    if(variants.has(scale))return variants.get(scale);
    const result=document.createElement('canvas');
    result.width=Math.round(matrix[0].length*scale);result.height=Math.round(matrix.length*scale);
    const r=result.getContext('2d');r.imageSmoothingEnabled=false;
    // Fill integer pixel blocks to keep a crisp 24px enemy (16x16 source).
    for(let row=0;row<matrix.length;row++){
      const str=matrix[row];
      for(let col=0;col<str.length;col++){
        const color=palette[str[col]];
        if(color){r.fillStyle=color;r.fillRect(Math.round(col*scale),Math.round(row*scale),Math.round((col+1)*scale)-Math.round(col*scale),Math.round((row+1)*scale)-Math.round(row*scale));}
      }
    }
    variants.set(scale,result);return result;
  }
  function sprite(ctx,matrix,x,y,scale=2,flip=false){
    const cached=spriteCanvas(matrix,scale),xx=Math.round(x),yy=Math.round(y);
    ctx.save();
    if(flip){ctx.translate(xx+cached.width,yy);ctx.scale(-1,1);ctx.drawImage(cached,0,0);}
    else ctx.drawImage(cached,xx,yy);
    ctx.restore();
  }
  function pixelSparkle(ctx,x,y,scale,color){
    x=Math.round(x);y=Math.round(y);
    ctx.fillStyle=color;
    ctx.fillRect(x,y-scale,scale,scale*3);
    ctx.fillRect(x-scale,y,scale*3,scale);
    ctx.fillStyle='#fffef0';ctx.fillRect(x,y,scale,scale);
  }
  function background(ctx,w,h,tm=0){
    ctx.fillStyle='#ffffe0';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#f0f0ca';
    for(let y=0;y<h;y+=20){for(let x=0;x<w;x+=20){if(((x+y)/20)%2===0)ctx.fillRect(x,y,20,20);}}
    ctx.fillStyle='#d5dbab';
    for(let y=11;y<h;y+=40){for(let x=13;x<w;x+=40){ctx.fillRect(x,y,2,2);ctx.fillRect(x+9,y+7,1,1);}}
    ctx.fillStyle='#73806f';ctx.fillRect(0,0,w,3);ctx.fillRect(0,h-3,w,3);ctx.fillRect(0,0,3,h);ctx.fillRect(w-3,0,3,h);
    const drift = Math.sin(tm*0.001);
    ctx.fillStyle='#b9c8a5';
    ctx.fillRect(42,23,14,3);ctx.fillRect(63,23,4,3);
    ctx.fillRect(w-74,h-33,12,3);ctx.fillRect(w-56,h-33,6,3);
    if(drift>0){ctx.fillRect(w-89,41,2,4);}
  }
  function player(ctx,x,y,opts={}){
    const scale=opts.scale||2;const width=16*scale;
    const bob=opts.moving ? (Math.floor((opts.time||0)*10)%2===0?-1:0):0;
    if(opts.invincible&&!opts.reducedMotion&&Math.floor((opts.time||0)*10)%2)ctx.globalAlpha=.35;
    sprite(ctx,hero,Math.round(x-width/2),Math.round(y-18*scale/2)+bob,scale,opts.direction==='left');
    ctx.globalAlpha=1;
    if(opts.boost){ctx.fillStyle='#2a638d';const s=opts.time||0;ctx.fillRect(Math.round(x-width/2-3),Math.round(y+3+Math.sin(s*20)*2),3,1);ctx.fillRect(Math.round(x-width/2-5),Math.round(y-2),3,1);}
    if(opts.invincible){ctx.strokeStyle='#b3261e';ctx.lineWidth=1;ctx.strokeRect(Math.round(x-9),Math.round(y-10),18,20);}
  }
  function chaser(ctx,x,y,opts={}){
    const scale=opts.scale||2;const w=16*scale;
    sprite(ctx,enemy,Math.round(x-w/2),Math.round(y-16*scale/2),scale,opts.direction==='left');

  }
  function food(ctx,x,y,isPremium=false,tm=0,opts={}){
    const reduced=Boolean(opts.reducedMotion);
    const bob=reduced?0:Math.round(Math.sin(tm*0.0042)*3);
    if(!isPremium){
      sprite(ctx,burger,Math.round(x-8),Math.round(y-6)+bob,1);
      return;
    }
    // GOLD body is 24 x 18, exactly 150% of a 16 x 12 ordinary burger.
    // Gold crown/glints are visual only, excluded from the true collider.
    const bx=Math.round(x),by=Math.round(y)+bob;
    const phase=Math.floor(tm/150)%8;
    ctx.fillStyle=phase<4?'#e6b72e':'#b17b16';
    ctx.fillRect(bx-13,by-9,26,1);
    ctx.fillRect(bx-13,by+9,26,1);
    // Crisp 3-point crown hovering above the burger.
    ctx.fillStyle='#6b4e00';ctx.fillRect(bx-6,by-15,12,5);
    ctx.fillStyle='#f2c94c';ctx.fillRect(bx-6,by-18,3,7);ctx.fillRect(bx-1,by-21,3,10);ctx.fillRect(bx+4,by-18,3,7);
    ctx.fillStyle='#fff4b0';ctx.fillRect(bx,by-20,1,3);
    bitmapResized(ctx,premium,bx-12,by-9,24,18);
    if(!reduced){
      const glints=[[-16,-13],[17,-8],[-15,8],[16,11]];
      const first=phase%glints.length,second=(first+2)%glints.length;
      for(const i of [first,second])pixelSparkle(ctx,bx+glints[i][0],by+glints[i][1],i===first?2:1,'#f2c94c');
    }else pixelSparkle(ctx,bx+16,by-5,1,'#d9a400');
  }
  // Actor hitboxes are sourced from the EXACT opaque bitmap bounds.  Decorative
  // crowns, sparkles, floating text and speed trails are intentionally excluded.
  function opaqueBounds(matrix,destW,destH){
    const sourceW=matrix[0].length,sourceH=matrix.length;
    let minX=sourceW,minY=sourceH,maxX=-1,maxY=-1;
    for(let y=0;y<sourceH;y++)for(let x=0;x<sourceW;x++)if(palette[matrix[y][x]]){
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<0)return {x:0,y:0,w:0,h:0};
    const left=Math.floor(minX*destW/sourceW),top=Math.floor(minY*destH/sourceH);
    const right=Math.ceil((maxX+1)*destW/sourceW),bottom=Math.ceil((maxY+1)*destH/sourceH);
    return {x:left,y:top,w:right-left,h:bottom-top};
  }
  const hitShapes={
    player:opaqueBounds(hero,16,18),enemy:opaqueBounds(enemy,16,16),
    food:opaqueBounds(burger,16,12),gold:opaqueBounds(premium,24,18)
  };
  function getHitbox(kind,x,y,tm=0,opts={}){
    const size=kind==='player'?[16,18]:kind==='enemy'?[16,16]:kind==='gold'?[24,18]:[16,12];
    const bob=(kind==='food'||kind==='gold')&&!opts.reducedMotion?Math.round(Math.sin(tm*.0042)*3):
              kind==='player'&&opts.moving&&Math.floor(tm/100)%2===0?-1:0;
    const left=Math.round(x-size[0]/2),top=Math.round(y-size[1]/2)+bob;
    const b=hitShapes[kind];return {x:left+b.x,y:top+b.y,w:b.w,h:b.h};
  }
  function bitmapResized(ctx,matrix,x,y,w,h){
    const cached=spriteCanvas(matrix,1);ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(cached,Math.round(x),Math.round(y),w,h);ctx.restore();
  }
  function preview(canvas){
    if(!canvas)return;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
    background(ctx,208,144,0);
    ctx.fillStyle='#2f7048';ctx.fillRect(9,9,79,16);ctx.fillStyle='#fffef1';ctx.font='bold 9px monospace';ctx.fillText('10 BURGERS',13,20);
    player(ctx,48,81,{scale:1});chaser(ctx,166,75,{scale:1});food(ctx,106,104,false,0,{scale:1});food(ctx,108,51,true,0,{scale:1});
    ctx.fillStyle='#181c1d';ctx.font='bold 10px monospace';ctx.fillText('RUN! →',26,135);
  }
  window.SSGArt={player,chaser,food,background,preview,getHitbox,hitShapes};
})();
