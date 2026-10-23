/* Snack & Dash v0.0.1.0 — unified PC/touch/gamepad controls.
 * No dependency or CDN is needed. Uses Pointer Events and Gamepad API.
 * This module changes input only, never movement speed or game rules.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
class SSGControls {
 constructor(game,app){
  this.game=game;this.app=app;this.settings={touchVisible:'auto',touchType:'joystick',touchSide:'left',stickDeadzone:15};
  this.pointer=null;this.dpadPointers=new Map();this.padVector={x:0,y:0};
  this.padButtons={dash:false,pause:false,action:false,up:false,down:false,left:false,right:false};
  this.padPresent=false;this.padName='';this.padWasActive=false;this.lastMenuDirection=0;this.lastInputDevice='';
  this._boundPoll=()=>this.poll();
 }
 bind(){
  const joystick=$('joystick-area');
  joystick.addEventListener('pointerdown',e=>{
   if(this.pointer!==null||!this.game.running||this.game.paused)return;
   e.preventDefault();this.pointer=e.pointerId;
   try{joystick.setPointerCapture(e.pointerId);}catch(_){}
   this.moveJoystick(e);
  });
  joystick.addEventListener('pointermove',e=>{
   if(this.pointer!==e.pointerId)return;
   e.preventDefault();this.moveJoystick(e);
  });
  const release=e=>{if(this.pointer!==e.pointerId)return;this.clearJoystick();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(name,release);
  // A D-pad uses one independent pointer per button: diagonals work on touch.
  for(const btn of document.querySelectorAll('[data-dir]')){
   btn.addEventListener('pointerdown',e=>{
    if(!this.game.running||this.game.paused)return;
    e.preventDefault();this.dpadPointers.set(e.pointerId,btn.dataset.dir);
    try{btn.setPointerCapture(e.pointerId);}catch(_){}
    this.syncDpad();
   });
   const release=e=>{if(!this.dpadPointers.has(e.pointerId))return;
    this.dpadPointers.delete(e.pointerId);this.syncDpad();};
   for(const type of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(type,release);
  }
  const dash=$('touch-dash');
  dash.addEventListener('pointerdown',e=>{
   if(!this.game.running||this.game.paused)return;
   e.preventDefault();this.game.dash();
   try{dash.setPointerCapture(e.pointerId);}catch(_){}
  });
  $('touch-pause').addEventListener('click',()=>this.game.togglePause());
  window.addEventListener('blur',()=>this.clearTouch());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clearTouch();});
  window.addEventListener('gamepadconnected',()=>this.checkConnection());
  window.addEventListener('gamepaddisconnected',()=>this.checkConnection());
  this.checkConnection();
  requestAnimationFrame(this._boundPoll);
 }
 applySettings(settings){
  this.settings={...this.settings,...settings};
  const coarse=Boolean(window.matchMedia?.('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0||('ontouchstart' in window&&window.innerWidth<=800));
  const visible=this.settings.touchVisible==='on'||(this.settings.touchVisible==='auto'&&coarse);
  document.documentElement.classList.toggle('show-touch-controls',visible);
  $('touch-controls').dataset.handed=this.settings.touchSide;
  $('joystick-area').hidden=this.settings.touchType==='dpad';
  $('touch-dpad').hidden=this.settings.touchType!=='dpad';
  this.clearTouch();
 }
 moveJoystick(e){
  const rect=$('joystick-base').getBoundingClientRect();
  const x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);
  const travel=Math.max(1,rect.width/2-18);
  const len=Math.hypot(x,y),ratio=Math.min(1,len/travel),deadzone=clamp(Number(this.settings.stickDeadzone)||15,5,40)/100;
  const capped=len>0?Math.min(travel,len)/len:0;
  $('joystick-knob').style.setProperty('--stick-x',`${(x*capped).toFixed(1)}px`);
  $('joystick-knob').style.setProperty('--stick-y',`${(y*capped).toFixed(1)}px`);
  if(ratio<=deadzone||len===0)this.game.setTouchAnalog(0,0,true);
  else this.game.setTouchAnalog(x/len,y/len,true);
  this.lastInputDevice='touch';
 }
 clearJoystick(){
  this.pointer=null;
  $('joystick-knob').style.setProperty('--stick-x','0px');
  $('joystick-knob').style.setProperty('--stick-y','0px');
  this.game.setTouchAnalog(0,0,false);
 }
 syncDpad(){
  for(const dir of ['up','down','left','right'])this.game.setTouchDirection(dir,Array.from(this.dpadPointers.values()).includes(dir));
 }
 clearTouch(){
  this.clearJoystick();this.dpadPointers.clear();this.syncDpad();
 }
 gamepadVector(){return this.padVector;}
 findGamepad(){
  try{
   if(typeof navigator.getGamepads!=='function')return null;
   const pads=navigator.getGamepads();return Array.from(pads||[]).find(p=>p&&p.connected!==false)||null;
  }catch(_){return null;}
 }
 checkConnection(){this.updateStatus(this.findGamepad());}
 updateStatus(pad){
  const connected=Boolean(pad),name=connected?String(pad.id||'ゲームパッド').slice(0,55):'';
  if(connected===this.padPresent&&name===this.padName)return;
  const disconnected=this.padPresent&&!connected;
  this.padPresent=connected;this.padName=name;
  const status=$('gamepad-status');
  if(status)status.textContent=connected?'ゲームパッド：接続済み（'+name+'）':'ゲームパッド：未接続（接続後、ボタンを押すと認識されます）';
  if(disconnected&&this.lastInputDevice==='gamepad'&&this.game.running&&!this.game.paused){
   this.game.pause();this.game.setTip('コントローラーが切断されたため一時停止しました。再接続するか、タッチ・キーボードで再開してください。','コントローラー切断');
  }
 }
 poll(){
  if(document.hidden){requestAnimationFrame(this._boundPoll);return;}
  const pad=this.findGamepad();this.updateStatus(pad);
  const previous=this.padButtons;
  const state={dash:false,pause:false,action:false,up:false,down:false,left:false,right:false};
  let x=0,y=0;
  if(pad){
   const b=i=>Boolean(pad.buttons?.[i]?.pressed);
   const axisX=Number(pad.axes?.[0])||0,axisY=Number(pad.axes?.[1])||0;
   const deadzone=.20;
   const ax=Math.abs(axisX)>deadzone?axisX:0,ay=Math.abs(axisY)>deadzone?axisY:0;
   state.up=b(12)||ay<-.55;state.down=b(13)||ay>.55;
   state.left=b(14)||ax<-.55;state.right=b(15)||ax>.55;
   // D-pad takes priority over a drifting analog stick.
   const dpadUsed=[12,13,14,15].some(b);
   x=dpadUsed?(Number(b(15))-Number(b(14))):ax;
   y=dpadUsed?(Number(b(13))-Number(b(12))):ay;
   state.dash=b(0)||b(1); // Xbox A/B, PlayStation Cross/Circle, Switch B/A (standard mapping)
   state.action=b(0);state.pause=b(9);
   if(Math.hypot(x,y)>.3||state.dash||state.pause){this.lastInputDevice='gamepad';}
  }
  this.padVector={x:clamp(x,-1,1),y:clamp(y,-1,1)};
  const isPlaying=this.game.running;
  if(isPlaying){
   if(state.pause&&!previous.pause)this.game.togglePause();
   // Only a new press triggers a dash; a held button cannot consume multiple charges.
   if(state.dash&&!previous.dash&&!this.game.paused)this.game.dash();
  }else if(this.app.screen!=='play'&&pad){
   const direction=state.down&&!previous.down?1:state.up&&!previous.up?-1:state.right&&!previous.right?1:state.left&&!previous.left?-1:0;
   if(direction)this.menuMove(direction);
   if(state.action&&!previous.action)this.menuActivate();
  }
  this.padButtons=state;
  requestAnimationFrame(this._boundPoll);
 }
 menuButtons(){
  const parent=$('screen-'+this.app.screen);
  return Array.from(parent?.querySelectorAll('button:not([disabled]):not([hidden])')||[])
   .filter(el=>el.getClientRects().length>0);
 }
 menuMove(direction){
  const buttons=this.menuButtons();if(!buttons.length)return;
  const idx=buttons.indexOf(document.activeElement);
  buttons[(idx<0?(direction>0?0:buttons.length-1):(idx+direction+buttons.length)%buttons.length)].focus({preventScroll:false});
 }
 menuActivate(){
  const buttons=this.menuButtons(),active=document.activeElement;
  if(buttons.includes(active)){active.click();return;}
  // When the software keyboard is not usable, the player can save as unknown.
  if(this.app.screen==='result'&&!$('score-save-form').hidden){$('score-save-btn').click();return;}
  buttons[0]?.focus({preventScroll:true});buttons[0]?.click();
 }
}
window.SSGControls=SSGControls;
})();
