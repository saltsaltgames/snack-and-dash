(function () {
'use strict';
// Larger logical playfield restores fine keyboard control; actors remain small
// 1:1 pixel sprites, matching the original character-to-world proportions.
const WIDTH=320,HEIGHT=240,BASE_SPEED=172,DASH_BONUS=100,HIT_BONUS=100,DASH_SECONDS=2,INVINCIBLE_SECONDS=2;
const FOOD_INTERVAL_SECONDS=5,FOOD_LIFETIME_SECONDS=5;
// Millisecond-linear, uncapped enemy acceleration. 0.0024 balances 320x240
// at 172px/s; original MakeCode score-per-second was never measured.
const ENEMY_ACCEL_PER_MS=0.0024;
const MOVE_KEYS=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD']);
const DASH_KEYS=new Set(['KeyB','Space','ShiftLeft','ShiftRight']);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
// Swept AABB: relative center motion checked against expanded hitbox extents.
// A visually displayed rectangle and the physical collision use the exact
// same SSGArt.getHitbox() result. Includes tunneling prevention at high speed.
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function sweptAABB(a0,a1,b0,b1){
 if(intersects(a0,b0)||intersects(a1,b1))return true;
 const acx=a0.x+a0.w/2,acy=a0.y+a0.h/2;
 const bcx=b0.x+b0.w/2,bcy=b0.y+b0.h/2;
 const x=acx-bcx,y=acy-bcy;
 const vx=(a1.x-a0.x)-(b1.x-b0.x),vy=(a1.y-a0.y)-(b1.y-b0.y);
 const hw=(Math.max(a0.w,a1.w)+Math.max(b0.w,b1.w))/2;
 const hh=(Math.max(a0.h,a1.h)+Math.max(b0.h,b1.h))/2;
 let entry=0,exit=1;
 for(const [start,delta,half] of [[x,vx,hw],[y,vy,hh]]){
  if(Math.abs(delta)<1e-10){if(Math.abs(start)>=half)return false;continue;}
  const a=(-half-start)/delta,b=(half-start)/delta;
  entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  if(entry>exit)return false;
 }
 return exit>=0&&entry<=1;
}
function fmt(sec){sec=Math.max(0,Math.floor(sec));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
class FoodTagGame {
 constructor(canvas,audio,callbacks={}){
  this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.ctx.imageSmoothingEnabled=false;
  this.audio=audio;this.callbacks=callbacks;
  this.settings={hints:true,reducedMotion:false,showHitboxes:true};this.keys=new Set();this.touchDirs=new Set();this.gamepadDash=false;this.touchVector={x:0,y:0};this.touchActive=false;
  this.running=false;this.paused=false;this.raf=0;this.lastFrame=0;this.lastUi=0;
  this.boundKeyDown=e=>this.keyDown(e);this.boundKeyUp=e=>this.keyUp(e);
  window.addEventListener('keydown',this.boundKeyDown);window.addEventListener('keyup',this.boundKeyUp);
  window.addEventListener('blur',()=>{this.keys.clear();this.gamepadDash=false;this.touchVector={x:0,y:0};this.touchActive=false;});
 }
 start(mode,settings={}){
  this.stop();this.settings={...this.settings,...settings};this.mode=mode;this.running=true;this.paused=false;
  this.t=0;this.progressScore=0;this.foodCount=0;this.foodHalfUnits=0;this.life=3;this.dashCharges=0;
  this.dashes=[];this.hitBoostEnd=0;this.invincibleEnd=0;
  this.player={x:160,y:120,direction:'right',moving:false};
  this.enemy={x:282,y:210,vx:0,vy:0,burstEnd:0,nextBurstAt:6,lastTrailAt:-1};
  this.food=null;this.nextFoodAt=FOOD_INTERVAL_SECONDS;this.foodCycle=0;this.floating=[];this.particles=[];this.message=null;this.tutStep=0;this.tutWalk=0;
  this.tutAdvanceAt=0;this.tutorialComplete=false;this.tutorialEnemy=false;
  this.keys.clear();this.touchDirs.clear();this.gamepadDash=false;this.touchVector={x:0,y:0};this.touchActive=false;this.lastUi=0;this.lastFrame=performance.now();
  if(mode==='tutorial'){
   this.player={x:92,y:120,direction:'right',moving:false};
   this.enemy={x:260,y:160,vx:0,vy:0,burstEnd:0,nextBurstAt:Infinity,lastTrailAt:-1};
   this.dashCharges=0;this.setTip('まずは操作して歩いてみよう！','あそびかた');
  }else{
   this.setTip(mode==='hb'?'10個集めるとゲームクリア！':'逃げ続けてハイスコアに挑戦！','スタート');
  }
  this.audio.startMusic();this.updateUI(true);this.draw();this.raf=requestAnimationFrame(now=>this.loop(now));
 }
 stop(){this.running=false;this.paused=false;this.audio.stopMusic();cancelAnimationFrame(this.raf);this.keys.clear();this.touchDirs.clear();this.gamepadDash=false;this.touchVector={x:0,y:0};this.touchActive=false;this.controls?.clearTouch();}
 pause(){if(!this.running||this.paused)return;this.paused=true;this.keys.clear();this.touchDirs.clear();this.gamepadDash=false;this.touchVector={x:0,y:0};this.touchActive=false;this.controls?.clearTouch();this.audio.stopMusic();this.callbacks.onPause?.(true);}
 resume(){if(!this.running||!this.paused)return;this.paused=false;this.lastFrame=performance.now();this.audio.startMusic();this.callbacks.onPause?.(false);this.canvas.focus({preventScroll:true});}
 togglePause(){this.paused?this.resume():this.pause();}
 keyDown(e){
  if(!this.running)return;
  if(MOVE_KEYS.has(e.code)||DASH_KEYS.has(e.code)||e.code==='Escape'||e.code==='KeyP'||e.code==='KeyC')e.preventDefault();
  if(e.code==='Escape'||e.code==='KeyP'){if(!e.repeat)this.togglePause();return;}
  if(e.code==='KeyC'){if(!e.repeat)this.setHitboxes(!this.settings.showHitboxes);return;}
  if(this.paused)return;
  if(MOVE_KEYS.has(e.code)||DASH_KEYS.has(e.code))if(this.controls)this.controls.lastInputDevice='keyboard';
  if(DASH_KEYS.has(e.code)&&!e.repeat&&!this.keys.has(e.code))this.dash();
  this.keys.add(e.code);
 }
 keyUp(e){if(this.running&&(MOVE_KEYS.has(e.code)||DASH_KEYS.has(e.code)))e.preventDefault();this.keys.delete(e.code);}
 setHitboxes(enabled){this.settings.showHitboxes=Boolean(enabled);this.callbacks.onHitboxToggle?.(this.settings.showHitboxes);this.draw();}
 setTouchDirection(dir,pressed){if(pressed)this.touchDirs.add(dir);else this.touchDirs.delete(dir);}
 setTouchAnalog(x,y,active){this.touchActive=Boolean(active);this.touchVector={x:clamp(x,-1,1),y:clamp(y,-1,1)};}
 currentDashCount(){return this.dashes.filter(d=>d>this.t).length;}
 playerSpeed(){return BASE_SPEED+this.currentDashCount()*DASH_BONUS+(this.hitBoostEnd>this.t?HIT_BONUS:0);}
 enemySpeed(){return this.t*1000*ENEMY_ACCEL_PER_MS;}
 setTip(text,heading='ヒント'){
  if(!this.settings.hints&&heading==='ヒント')return;
  this.callbacks.onTip?.(text,heading);
 }
 say(text,duration=2){this.message={text,until:this.t+duration};}
 float(text,x,y,color='#2f7048'){
  this.floating.push({text,x,y,color,until:this.t+1.25,born:this.t});
 }
 dash(){
  if(!this.running||this.paused)return false;
  if(this.dashCharges<=0){this.say('ダッシュの残りが0回！',1.2);this.audio.effect('warning');return false;}
  const hadBoost=this.currentDashCount()>0;
  this.dashCharges--;
  this.dashes.push(this.t+DASH_SECONDS);
  this.audio.effect('dash');
  this.say(hadBoost?'重ね掛け！ もっと速い！':'2秒間ダッシュ！',1.2);
  this.float('SPEED +100',this.player.x,this.player.y-25,'#2a638d');
  if(this.mode==='tutorial'){
   if(this.tutStep===2){this.advanceTutorial();}
   else if(this.tutStep===3&&this.currentDashCount()>=2){this.advanceTutorial();}
  }
  this.updateUI(true);return true;
 }
 tutorialDescription(){
  return [
   {title:'歩いてみよう',description:'矢印キー / WASD / ジョイスティック・十字キーで合計50px移動！',progress:clamp(this.tutWalk/50,0,1)},
   {title:'ハンバーガーを集めよう',description:'画面のハンバーガーに触れて回収。',progress:0},
   {title:'ダッシュしてみよう',description:'B / SPACE / SHIFT / DASHボタンでダッシュ！',progress:0},
   {title:'速さを重ねてみよう',description:'速い状態のまま、もう一度ダッシュ！ 速度が加算されるよ。',progress:Math.min(1,this.currentDashCount()/2)},
   {title:'鬼に触れた後は無敵！',description:'練習の鬼に近づいてみよう。ぶつかった後の2秒間は無敵＆高速。',progress:0}
  ][clamp(this.tutStep,0,4)];
 }
 advanceTutorial(){
  if(this.mode!=='tutorial'||this.tutorialComplete)return;
  this.tutStep++;
  if(this.tutStep===1){
   this.food={x:clamp(this.player.x+43,16,WIDTH-16),y:clamp(this.player.y+9,16,HEIGHT-16),premium:false,expires:Infinity};
   this.say('触れるだけでゲット！',1.8);
  }
  if(this.tutStep===2){this.dashCharges=Math.max(this.dashCharges,2);this.say('Bを押してダッシュ！',2);}
  if(this.tutStep===3){this.dashCharges=Math.max(this.dashCharges,2);this.say('さらにもう一度！',1.7);}
  if(this.tutStep===4){
   this.dashes=[];this.enemy.x=clamp(this.player.x+55,16,WIDTH-16);
   this.enemy.y=clamp(this.player.y+28,16,HEIGHT-16);this.tutorialEnemy=true;
   this.say('鬼にぶつかると…？',2);
  }
  if(this.tutStep>=5){
   this.tutorialComplete=true;this.say('2秒間は無敵！ 練習完了！',2);
   this.audio.effect('clear');this.running=false;this.audio.stopMusic();cancelAnimationFrame(this.raf);
   this.callbacks.onTutorialComplete?.();return;
  }
  this.updateUI(true);
 }
 spawnFood(premium=false){
  if(this.mode!=='hb')return;
  let x,y;
  if(premium){x=this.enemy.x;y=this.enemy.y;}
  else{
   let found=false;
   for(let attempt=0;attempt<24;attempt++){
    const xx=18+Math.random()*(WIDTH-36),yy=18+Math.random()*(HEIGHT-36);
    if(Math.hypot(xx-this.player.x,yy-this.player.y)>42&&Math.hypot(xx-this.enemy.x,yy-this.enemy.y)>34){x=xx;y=yy;found=true;break;}
   }
   if(!found){x=clamp(WIDTH-this.player.x,18,WIDTH-18);y=clamp(HEIGHT-this.player.y,18,HEIGHT-18);}
  }
  this.food={x,y,premium,expires:this.t+FOOD_LIFETIME_SECONDS};
  if(premium){this.setTip('金色に輝くGOLDバーガー！ 鬼の近くで取るとダッシュ＋1','GOLD BURGER');this.audio.effect('goldSpawn');}
 }
 goldBurst(x,y){
  // Deterministic lifetime effects; visuals do not change game physics or collision.
  for(let i=0;i<22;i++){
   const a=i*Math.PI*2/22;const speed=25+(i%5)*12;
   this.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-12,
    color:['#fff7bd','#f2c94c','#ffffff','#a87400'][i%4],size:i%4===0?3:2,born:this.t,until:this.t+0.65+(i%3)*0.13});
  }
 }
  sprayBurst(count=8){
    const ex=this.enemy.x,ey=this.enemy.y;
    const angle=Math.atan2(this.enemy.vy||0,this.enemy.vx||1),back=angle+Math.PI;
    for(let i=0;i<count;i++){
      const a=back+(Math.random()-.5)*2.1,v=22+Math.random()*65;
      this.particles.push({x:ex,y:ey,vx:Math.cos(a)*v,vy:Math.sin(a)*v-10,
        color:['#7c876b','#b48b31','#e6be75','#ffffff'][i%4],size:i%4===0?2:1,
        born:this.t,until:this.t+.19+Math.random()*.38});
    }
  }
 collect(){
  if(!this.food)return;
  const food=this.food;this.food=null;
  this.audio.effect(food.premium?'premium':'pickup');
  this.foodCount++;
  // One normal burger = 2 half-units, one GOLD = 3 half-units.
  // Integer accounting avoids decimal comparison errors at the goal.
  this.foodHalfUnits+=food.premium?3:2;
  if(food.premium)this.dashCharges++;
  this.say(food.premium?'GOLD +1.5！ ダッシュ＋1':'ハンバーガー +1.0！',food.premium?2:1.5);
  if(food.premium)this.goldBurst(food.x,food.y);
  this.float(food.premium?'GOLD +1.5 / DASH +1':'+1.0 BURGER',food.x,food.y-25,food.premium?'#8d5900':'#2f7048');
  if(this.mode==='tutorial'&&this.tutStep===1){this.advanceTutorial();return;}
  if(this.mode==='hb'&&this.foodHalfUnits>=20){this.end(true);return;}
  this.updateUI(true);
 }
 hit(){
  if(this.t<this.invincibleEnd)return;
  if(this.mode==='tutorial'&&this.tutStep!==4)return;
  this.life--;this.hitBoostEnd=this.t+INVINCIBLE_SECONDS;this.invincibleEnd=this.t+INVINCIBLE_SECONDS;
  this.audio.effect('hit');this.say('2秒間は無敵 ＋ 高速！',2);
  this.float('LIFE -1',this.player.x,this.player.y-24,'#b3261e');
  this.setTip('被弾後の2秒間は無敵＆高速！ 逃げよう！','ダメージ');
  this.updateUI(true);
  if(this.mode==='tutorial'){this.advanceTutorial();return;}
  if(this.life<=0)this.end(false);
 }
 end(won){
  if(!this.running)return;
  const result={mode:this.mode,won:Boolean(won),score:this.progressScore,seconds:this.t,food:this.foodHalfUnits/2,foodHalfUnits:this.foodHalfUnits,life:this.life};
  this.stop();this.audio.effect(won?'clear':'lose');this.callbacks.onEnd?.(result);
 }
 gamepadInput(){return this.controls?.gamepadVector()||{x:0,y:0};}
 loop(now){
  if(!this.running)return;
  const elapsed=Math.max(0,(now-this.lastFrame)/1000);this.lastFrame=now;
  if(!this.paused&&elapsed>2){
   // OS suspend / tab throttling: never teleport or kill the player on wake.
   this.pause();
   this.setTip('スリープなどで実行が中断されたため一時停止しました。再開ボタンから続けられます。','自動一時停止');
  }
  if(!this.paused){
   // Simulate all elapsed active time rather than dropping time after 50ms.
   // Small steps keep swept collision and enemy pursuit reliable on slow devices.
   const steps=Math.max(1,Math.min(480,Math.ceil(elapsed/(1/120))));
   const dt=elapsed/steps;
   for(let i=0;i<steps&&this.running;i++)this.update(dt);
  }
  this.draw();
  if(this.running)this.raf=requestAnimationFrame(n=>this.loop(n));
 }
 update(dt){
  if(!this.running)return;
  const p=this.player,previousP={x:p.x,y:p.y},previousE={x:this.enemy.x,y:this.enemy.y};
  const oldPBox=SSGArt.getHitbox('player',p.x,p.y,this.t*1000,{moving:p.moving});
  const oldEBox=SSGArt.getHitbox('enemy',this.enemy.x,this.enemy.y);
  this.t+=dt;
  this.dashes=this.dashes.filter(d=>d>this.t);
  let dx=0,dy=0;
  if(this.keys.has('ArrowLeft')||this.keys.has('KeyA')||this.touchDirs.has('left'))dx--;
  if(this.keys.has('ArrowRight')||this.keys.has('KeyD')||this.touchDirs.has('right'))dx++;
  if(this.keys.has('ArrowUp')||this.keys.has('KeyW')||this.touchDirs.has('up'))dy--;
  if(this.keys.has('ArrowDown')||this.keys.has('KeyS')||this.touchDirs.has('down'))dy++;
  const pad=this.gamepadInput();
  // One active input source wins: no cancellation by drifting gamepads.
  // Keyboard/D-pad outranks analog touch, analog touch outranks gamepad.
  const directInput=this.touchDirs.size>0||Array.from(MOVE_KEYS).some(key=>this.keys.has(key));
  if(!directInput){
    if(this.touchActive){dx=this.touchVector.x;dy=this.touchVector.y;}
    else {dx=pad.x;dy=pad.y;}
  }
  const length=Math.hypot(dx,dy);p.moving=length>.01;
  if(length>.01){dx/=length;dy/=length;
   p.x=clamp(p.x+dx*this.playerSpeed()*dt,9,WIDTH-9);
   p.y=clamp(p.y+dy*this.playerSpeed()*dt,10,HEIGHT-10);
   if(Math.abs(dx)>.12)p.direction=dx<0?'left':'right';
   if(this.mode==='tutorial'&&this.tutStep===0){this.tutWalk+=this.playerSpeed()*dt;if(this.tutWalk>=50)this.advanceTutorial();}
  }
  if(this.mode!=='tutorial'){
   const prev=this.progressScore;this.progressScore=Math.floor(this.t*60);
   for(let n=prev+1;n<=this.progressScore;n++){
    if(n%500===0){this.dashCharges++;this.say('ダッシュが1回回復！',1.6);this.setTip('B / SPACEで加速。効果中にさらに重ね掛け可能。');this.audio.effect('life');}
    if(n%1000===0){this.life++;this.say('ライフが1回復！',1.6);this.audio.effect('life');}
    if(n%500===0&&this.mode!=='tutorial')this.sprayBurst(10);
   }
  }
  if(this.mode==='hb'&&this.t>=this.nextFoodAt){
   // Exactly one spawn every 5s; an item never gets prematurely replaced.
   while(this.t>=this.nextFoodAt)this.nextFoodAt+=FOOD_INTERVAL_SECONDS;
   this.foodCycle++;this.spawnFood(this.foodCycle%3===0);
  }
  if(this.mode!=='tutorial'||this.tutorialEnemy){
   const targetX=p.x-this.enemy.x,targetY=p.y-this.enemy.y,dist=Math.hypot(targetX,targetY);
   if(this.mode!=='tutorial'&&this.t>=this.enemy.nextBurstAt){
    this.enemy.burstEnd=this.t+.2;this.enemy.nextBurstAt=this.t+7+Math.random()*12;
    this.sprayBurst(14);this.audio.effect('dash');
   }
   const burst=this.t<this.enemy.burstEnd;
   const v=this.mode==='tutorial'?75:(this.enemySpeed()+(burst?80:0));
   // Follow velocity approaches the target smoothly instead of turning instantly.
   const vx=dist>1e-8?targetX/dist*v:0,vy=dist>1e-8?targetY/dist*v:0;
   const ddx=vx-this.enemy.vx,ddy=vy-this.enemy.vy,dv=Math.hypot(ddx,ddy);
   const maxChange=Math.max(110,v*4.5)*dt;
   const factor=dv>maxChange?maxChange/dv:1;
   this.enemy.vx+=ddx*factor;this.enemy.vy+=ddy*factor;
   const mx=this.enemy.vx*dt,my=this.enemy.vy*dt;
   if(dist>0&&Math.hypot(mx,my)>=dist&&mx*targetX+my*targetY>0){
     this.enemy.x=p.x;this.enemy.y=p.y;this.enemy.vx=0;this.enemy.vy=0;
   }else{this.enemy.x=clamp(this.enemy.x+mx,8,WIDTH-8);this.enemy.y=clamp(this.enemy.y+my,8,HEIGHT-8);}
   if(burst&&this.t-this.enemy.lastTrailAt>.045){this.enemy.lastTrailAt=this.t;this.sprayBurst(7);}
  }
  if(this.food&&this.t>=this.food.expires)this.food=null;
  const playerBox=SSGArt.getHitbox('player',p.x,p.y,this.t*1000,{moving:p.moving});
  const enemyBox=SSGArt.getHitbox('enemy',this.enemy.x,this.enemy.y);
  if(this.food){
   const kind=this.food.premium?'gold':'food';
   const foodBox=SSGArt.getHitbox(kind,this.food.x,this.food.y,this.t*1000,{reducedMotion:this.settings.reducedMotion});
   const oldFoodBox=SSGArt.getHitbox(kind,this.food.x,this.food.y,(this.t-dt)*1000,{reducedMotion:this.settings.reducedMotion});
   if(sweptAABB(oldPBox,playerBox,oldFoodBox,foodBox))this.collect();
  }
  if(this.running&&sweptAABB(oldPBox,playerBox,oldEBox,enemyBox))this.hit();
  this.floating=this.floating.filter(item=>item.until>this.t);
  this.particles=this.particles.filter(item=>item.until>this.t);
  if(this.t*1000-this.lastUi>=100){this.lastUi=this.t*1000;this.updateUI();}
 }
 snapshot(){return {
  mode:this.mode,t:this.t,score:this.progressScore,food:this.foodHalfUnits/2,foodHalfUnits:this.foodHalfUnits,life:this.life,dash:this.dashCharges,
  speed:this.playerSpeed(),enemySpeed:this.mode==='tutorial'?75:this.enemySpeed(),paused:this.paused,
  foodRemaining:this.food&&Number.isFinite(this.food.expires)?Math.max(0,this.food.expires-this.t):null,
  tutorial:this.mode==='tutorial'?{step:this.tutStep,...this.tutorialDescription()}:null
 };}
 updateUI(force=false){if(force)this.lastUi=0;this.callbacks.onUpdate?.(this.snapshot());}
 draw(){
  const c=this.ctx,p=this.player,tm=this.t*1000;
  SSGArt.background(c,WIDTH,HEIGHT,tm);
  if(this.mode==='tutorial'&&this.tutStep===1&&this.food){c.strokeStyle='#2f7048';c.lineWidth=2;c.strokeRect(this.food.x-10,this.food.y-9,20,18);}
  if(this.food&&!this.food.premium)SSGArt.food(c,this.food.x,this.food.y,false,tm,{scale:1,reducedMotion:this.settings.reducedMotion});
  if(this.mode!=='tutorial'||this.tutorialEnemy){
   SSGArt.chaser(c,this.enemy.x,this.enemy.y,{scale:1,rush:this.t<this.enemy.burstEnd});
  }
  // Rare burger is drawn on top and slightly offset from its dangerous enemy spawn.
  if(this.food?.premium)SSGArt.food(c,this.food.x,this.food.y,true,tm,{scale:1,reducedMotion:this.settings.reducedMotion});
  SSGArt.player(c,p.x,p.y,{scale:1,direction:p.direction,time:this.t,moving:p.moving,boost:this.playerSpeed()>BASE_SPEED,invincible:this.invincibleEnd>this.t,reducedMotion:this.settings.reducedMotion});
  // The following outlines use exactly the same AABBs as collision detection.
  if(this.settings.showHitboxes){
   const boxes=[['player',p.x,p.y,'#1976d2',{moving:p.moving}],
     ...((this.mode!=='tutorial'||this.tutorialEnemy)?[['enemy',this.enemy.x,this.enemy.y,'#b3261e',{}]]:[]),
     ...(this.food?[[this.food.premium?'gold':'food',this.food.x,this.food.y,this.food.premium?'#b17b16':'#2e7d32',{reducedMotion:this.settings.reducedMotion}]]:[])];
   c.save();c.lineWidth=1;c.setLineDash([4,2]);
   for(const [kind,x,y,color,opts] of boxes){
    const b=SSGArt.getHitbox(kind,x,y,tm,opts);
    c.strokeStyle=color;c.strokeRect(b.x+.5,b.y+.5,b.w,b.h);
   }
   c.restore();
  }
  // HUD labels remain outside of important sprite hitboxes where possible.
  c.fillStyle='#1b2528';c.font='bold 7px monospace';
  c.fillText(this.mode==='tutorial'?'TUTORIAL':this.mode==='hb'?'HB / 10.0':'ENDLESS',7,10);
  if(this.food?.premium){c.fillStyle='#8d5900';c.fillText('GOLD',WIDTH-28,10);}
  // Lifetime bar uses the same game clock as expiration; visual only.
  if(this.food&&Number.isFinite(this.food.expires)){
   const b=SSGArt.getHitbox(this.food.premium?'gold':'food',this.food.x,this.food.y,tm,{reducedMotion:this.settings.reducedMotion});
   const track=Math.max(14,b.w),x=clamp(Math.round(this.food.x-track/2),2,WIDTH-track-2),y=clamp(Math.round(b.y+b.h+3),12,HEIGHT-5);
   const remaining=clamp((this.food.expires-this.t)/FOOD_LIFETIME_SECONDS,0,1);
   c.fillStyle='#393a2a';c.fillRect(x-1,y-1,track+2,5);
   c.fillStyle='#cfccb4';c.fillRect(x,y,track,3);
   c.fillStyle=this.food.premium?'#e3af21':remaining<.2?'#b3261e':'#2f7048';
   c.fillRect(x,y,Math.ceil(track*remaining),3);
  }
  if(this.message&&this.message.until>this.t){
   const font='bold 8px sans-serif';c.font=font;
   const maxWidth=WIDTH-16,lines=[''];
   for(const letter of Array.from(this.message.text)){
    const i=lines.length-1;
    if(c.measureText(lines[i]+letter).width>maxWidth&&lines[i].length&&lines.length<2)lines.push(letter);
    else if(c.measureText(lines[i]+letter).width<=maxWidth)lines[i]+=letter;
   }
   const boxWidth=Math.min(WIDTH-6,Math.ceil(Math.max(...lines.map(line=>c.measureText(line).width))+10));
   const bh=lines.length*10+6;
   const x=clamp(p.x-boxWidth/2,3,WIDTH-boxWidth-3),y=clamp(p.y-31,13,HEIGHT-bh-4);
   c.fillStyle='#1b2528';c.fillRect(Math.round(x),Math.round(y),Math.ceil(boxWidth),bh);
   c.fillStyle='#fffef1';lines.forEach((line,i)=>c.fillText(line,Math.round(x)+5,Math.round(y)+11+i*10));
  }
  // GOLD collect sparks: pixel squares, no gradients or expensive filters.
  for(const particle of this.particles){
   const age=this.t-particle.born;const lifetime=particle.until-particle.born;
   const fade=clamp((particle.until-this.t)/Math.max(0.01,lifetime*0.35),0,1);
   c.globalAlpha=fade;c.fillStyle=particle.color;
   c.fillRect(Math.round(particle.x+particle.vx*age),Math.round(particle.y+particle.vy*age+30*age*age),particle.size,particle.size);
  }c.globalAlpha=1;
  for(const f of this.floating){
   c.globalAlpha=clamp((f.until-this.t)/.45,0,1);c.fillStyle=f.color;c.font='bold 7px ui-monospace,monospace';
   const fw=c.measureText(f.text).width;c.fillText(f.text,clamp(f.x-fw/2,3,Math.max(3,WIDTH-fw-3)),f.y-(this.t-f.born)*6);
  }c.globalAlpha=1;
  if(this.paused){c.fillStyle='rgba(20,28,22,.35)';c.fillRect(0,0,WIDTH,HEIGHT);}
 }
}
window.SSGGameClass=FoodTagGame;
window.SSGFormatTime=fmt;
window.SSGCollision={intersects,sweptAABB};
})();
