(function(){
'use strict';
// Preserve the v0.0.0.4 storage key. A version-1 save is converted in place to v2.
const KEY='saltsalt_foodtag_v1';
const MAX_ENTRIES=500;
const $=id=>document.getElementById(id);
const defaultSettings=()=>({music:true,sfx:true,volume:50,hints:true,showHitboxes:true,reducedMotion:false,touchVisible:"auto",touchType:"joystick",touchSide:"left",stickDeadzone:15});
const defaultData=()=>({version:2,lastPlayerName:'',settings:defaultSettings(),records:{endlessBest:0,hbBest:null,plays:0,hbClears:0,entries:[]}});
const safeNumber=(value,maximum=1e12)=>Number.isFinite(Number(value))?Math.max(0,Math.min(maximum,Number(value))):0;
const safeInt=(n,max=1e12)=>Math.floor(safeNumber(n,max));
const cleanName=name=>{
 const normalized=typeof name==='string'?name.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim():'';
 return Array.from(normalized).slice(0,16).join('')||'unknown';
};
const fmtLong=sec=>{
 const total=Math.max(0,Math.round(safeNumber(sec,9999999)*100));
 return String(Math.floor(total/6000)).padStart(2,'0')+':'+String(Math.floor(total/100)%60).padStart(2,'0')+'.'+String(total%100).padStart(2,'0');
};
const dateString=value=>typeof value==='string'&&value.length<60&&Number.isFinite(Date.parse(value))?value:new Date().toISOString();
const entryFrom=(value,index=0)=>{
 if(!value||typeof value!=='object'||!['hb','endless'].includes(value.mode))return null;
 const seconds=safeNumber(value.seconds,9999999);
 return {
  id:typeof value.id==='string'&&value.id.length<90?value.id:'legacy-'+index+'-'+Math.round(seconds*100),
  name:cleanName(value.name),mode:value.mode,won:Boolean(value.won),seconds,
  score:safeInt(value.score),food:safeNumber(value.food,1000),date:dateString(value.date),
  legacy:Boolean(value.legacy)
 };
};
const normalize=input=>{
 if(!input||typeof input!=='object'||![1,2].includes(input.version))throw new Error('対応するセーブ形式はv1またはv2です。');
 const clean=defaultData();
 const settings=input.settings;
 if(settings&&typeof settings==='object'){
  for(const key of ['music','sfx','hints','showHitboxes','reducedMotion'])if(typeof settings[key]==='boolean')clean.settings[key]=settings[key];
  if(Number.isFinite(Number(settings.volume)))clean.settings.volume=Math.min(100,Math.max(0,Number(settings.volume)));
  if(['auto','on','off'].includes(settings.touchVisible))clean.settings.touchVisible=settings.touchVisible;
  if(['joystick','dpad'].includes(settings.touchType))clean.settings.touchType=settings.touchType;
  if(['left','right'].includes(settings.touchSide))clean.settings.touchSide=settings.touchSide;
  if(Number.isFinite(Number(settings.stickDeadzone)))clean.settings.stickDeadzone=Math.min(40,Math.max(5,Number(settings.stickDeadzone)));
 }
 if(input.version===2&&typeof input.lastPlayerName==='string'){
  const name=cleanName(input.lastPlayerName);clean.lastPlayerName=name==='unknown'?'':name;
 }
 const r=input.records||{};
 clean.records.endlessBest=safeInt(r.endlessBest);
 clean.records.hbBest=r.hbBest===null||r.hbBest===undefined||!Number.isFinite(Number(r.hbBest))?null:safeNumber(r.hbBest,9999999);
 clean.records.plays=safeInt(r.plays);clean.records.hbClears=safeInt(r.hbClears);
 const arr=input.version===1?r.history:r.entries;
 clean.records.entries=(Array.isArray(arr)?arr:[]).slice(0,MAX_ENTRIES)
  .map((v,i)=>entryFrom(input.version===1?{...v,name:'unknown',legacy:true}:v,i)).filter(Boolean);
 if(input.version===1){
  // Earlier versions saved an anonymous best separately from a 20-item history.
  // Keep a best even if its full historical entry has been pruned.
  if(clean.records.endlessBest>0&&!clean.records.entries.some(e=>e.mode==='endless'&&e.score>=clean.records.endlessBest)){
   clean.records.entries.push(entryFrom({id:'legacy-best-endless',name:'unknown',mode:'endless',won:false,score:clean.records.endlessBest,seconds:0,food:0,legacy:true,date:new Date().toISOString()},9996));
  }
  if(clean.records.hbBest!==null&&!clean.records.entries.some(e=>e.mode==='hb'&&e.won&&e.seconds<=clean.records.hbBest)){
   clean.records.entries.push(entryFrom({id:'legacy-best-hb',name:'unknown',mode:'hb',won:true,score:0,seconds:clean.records.hbBest,food:10,legacy:true,date:new Date().toISOString()},9997));
  }
 }
 clean.records.entries=clean.records.entries.slice(0,MAX_ENTRIES);
 for(const entry of clean.records.entries){
  if(entry.mode==='endless')clean.records.endlessBest=Math.max(clean.records.endlessBest,entry.score);
  if(entry.mode==='hb'&&entry.won&&(clean.records.hbBest===null||entry.seconds<clean.records.hbBest))clean.records.hbBest=entry.seconds;
 }
 return clean;
};
const dateText=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Date(n).toLocaleString('ja-JP'):'日時不明';};
class App{
 constructor(){
  this.storageAvailable=true;
  try{const raw=localStorage.getItem(KEY);this.data=raw?normalize(JSON.parse(raw)):defaultData();}
  catch(error){console.warn('Storage unavailable or invalid',error);this.data=defaultData();}
  this.pendingResult=null;this.rankMode='endless';
  this.audio=new SSGAudio();this.lastMode='hb';this.game=new SSGGameClass($('gameCanvas'),this.audio,{
   onUpdate:state=>this.updateHud(state),onTip:(message,heading)=>this.tip(message,heading),
   onEnd:result=>this.gameEnded(result),onPause:paused=>this.setPauseOverlay(paused),
   onTutorialComplete:()=>this.tutorialComplete(),onHitboxToggle:checked=>this.setHitboxes(checked)
  });
  this.controls=new SSGControls(this.game,this);this.game.controls=this.controls;
  this.screen='home';this.bind();this.save();this.applySettings();this.paintRecords();SSGArt.preview($('heroCanvas'));this.show('home');
 }
 bind(){
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>this.navigate(btn.dataset.nav)));
  $('start-hb').addEventListener('click',()=>this.start('hb'));
  $('start-endless').addEventListener('click',()=>this.start('endless'));
  $('start-tutorial').addEventListener('click',()=>this.start('tutorial'));
  $('how-tutorial').addEventListener('click',()=>this.start('tutorial'));
  $('skip-tutorial').addEventListener('click',()=>this.navigate('home'));
  $('pause-btn').addEventListener('click',()=>this.game.togglePause());
  $('resume-btn').addEventListener('click',()=>this.game.resume());
  $('quit-btn').addEventListener('click',()=>{this.game.stop();this.setPauseOverlay(false);this.show('home');});
  $('result-retry').addEventListener('click',()=>this.start(this.lastMode==='tutorial'?'hb':this.lastMode));
  $('score-save-form').addEventListener('submit',e=>{e.preventDefault();this.saveResult();});
  $('score-skip-btn').addEventListener('click',()=>this.skipResult());
  $('score-player-name').addEventListener('input',()=>this.refreshNamePreview());
  $('rank-endless').addEventListener('click',()=>this.setRankMode('endless'));
  $('rank-hb').addEventListener('click',()=>this.setRankMode('hb'));
  $('rank-view').addEventListener('change',()=>this.paintRanking());
  $('export-data').addEventListener('click',()=>this.exportData());
  $('import-data').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',e=>this.importData(e));
  $('clear-data').addEventListener('click',()=>this.clearData());
  $('test-sound').addEventListener('click',async()=>{await this.audio.init();this.audio.effect('premium');});
  const keys={'setting-music':'music','setting-sfx':'sfx','setting-hints':'hints','setting-hitboxes':'showHitboxes','setting-motion':'reducedMotion'};
  for(const [id,name] of Object.entries(keys))$(id).addEventListener('change',e=>{this.data.settings[name]=e.target.checked;this.syncSettings();});
  $('play-hitboxes').addEventListener('change',e=>this.setHitboxes(e.target.checked));
  $('setting-volume').addEventListener('input',e=>{this.data.settings.volume=Number(e.target.value);this.syncSettings();});
  // Native Pointer Events provide two-finger touch independent of keyboard/gamepads.
  this.controls.bind();
  for(const id of ['setting-touch-visible','setting-touch-type','setting-touch-side']){
   $(id).addEventListener('change',()=>{
    const key={'setting-touch-visible':'touchVisible','setting-touch-type':'touchType','setting-touch-side':'touchSide'}[id];
    this.data.settings[key]=$(id).value;this.syncSettings();
   });
  }
  $('setting-stick-deadzone').addEventListener('input',()=>{
   this.data.settings.stickDeadzone=Number($('setting-stick-deadzone').value);
   this.syncSettings();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.game.running&&!this.game.paused)this.game.pause();});
 }
 navigate(screen){
  if(this.game.running){
   if(!window.confirm('プレイを終了して移動しますか？（途中の記録は保存されません）'))return;
   this.game.stop();this.setPauseOverlay(false);
  }
  if(this.screen==='result'&&screen!=='result'&&this.pendingResult){
   if(!window.confirm('まだ記録を保存していません。保存せずに移動しますか？'))return;
   this.pendingResult=null;
  }
  this.show(screen);
 }
 show(screen){
  this.screen=screen;document.body.classList.toggle('playing-game',screen==='play');this.controls?.clearTouch();
  for(const el of document.querySelectorAll('main > section.screen'))el.hidden=el.id!=='screen-'+screen;
  document.querySelectorAll('[data-nav]').forEach(el=>{const active=el.dataset.nav===screen;el.classList.toggle('active',active);if(active&&el.classList.contains('nav-button'))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if(screen==='records')this.paintRecords();
  if(screen==='home')SSGArt.preview($('heroCanvas'));
  window.scrollTo({top:0,behavior:'instant'});
 }
 async start(mode){
  if(this.game.running)this.game.stop();
  this.pendingResult=null;this.lastMode=mode;this.setPauseOverlay(false);this.show('play');
  const title=mode==='hb'?'ハンバーガー回収':mode==='endless'?'エンドレス':'操作の練習';
  $('play-title').textContent=title;
  $('play-subtitle').textContent=mode==='hb'?'GAME / HB MODE':mode==='endless'?'GAME / ENDLESS':'PRACTICE / TUTORIAL';
  $('primary-label').textContent=mode==='endless'?'生存スコア':mode==='hb'?'集めたハンバーガー':'練習の進行';
  $('tutorial-panel').hidden=mode!=='tutorial';this.controls.clearTouch();
  await this.audio.init();
  if(this.screen!=='play'||this.lastMode!==mode)return;
  this.audio.setEnabled(this.data.settings.music,this.data.settings.sfx);
  this.game.start(mode,{hints:this.data.settings.hints,reducedMotion:this.data.settings.reducedMotion,showHitboxes:this.data.settings.showHitboxes});
  $('gameCanvas').focus({preventScroll:true});
  if(document.documentElement.classList.contains('show-touch-controls')&&window.innerWidth<900){
   document.querySelector('.arena-interactive').scrollIntoView({block:'start',behavior:'instant'});
  }
 }
 updateHud(state){
  if(state.mode==='hb')$('primary-stat').textContent=state.food.toFixed(1)+' / 10.0';
  else if(state.mode==='endless')$('primary-stat').textContent=state.score.toLocaleString('ja-JP');
  else $('primary-stat').textContent=(state.tutorial.step+1)+' / 5';
  $('life-stat').textContent='♥ × '+state.life;
  $('dash-stat').textContent=state.dash+' 回';
  $('enemy-stat').textContent=Math.floor(state.enemySpeed).toLocaleString('ja-JP')+' px/s';
  $('speed-stat').textContent=Math.floor(state.speed).toLocaleString('ja-JP')+' px/s';
  $('time-stat').textContent=SSGFormatTime(state.t);
  if(state.mode==='tutorial'){
   $('tutorial-counter').textContent='STEP '+(state.tutorial.step+1)+' / 5';
   $('tutorial-title').textContent=state.tutorial.title;
   $('tutorial-description').textContent=state.tutorial.description;
   $('tutorial-progress').style.width=(state.tutorial.progress*100)+'%';
  }
 }
 tip(message,heading){if(this.data.settings.hints||heading!=='ヒント'){$('tip-heading').textContent=heading;$('tip-text').textContent=message;}}
 setPauseOverlay(paused){$('pause-overlay').hidden=!paused;if(paused)$('resume-btn').focus();}
 gameEnded(result){
  // Do not automatically mutate records. The player chooses Save or Skip.
  this.pendingResult={...result};
  $('result-eyebrow').textContent=result.mode==='hb'?'RESULT / HB MODE':'RESULT / ENDLESS';
  $('result-title').textContent=result.won?'ゲームクリア！':'ゲームオーバー';
  $('result-symbol').textContent=result.won?'★':'×';$('result-symbol').style.color=result.won?'var(--green)':'var(--red)';
  $('result-message').textContent=result.won?'10.0個分以上を回収！ この記録を保存しますか？':'今回の記録をランキングに登録できます。';
  $('result-score-label').textContent=result.mode==='hb'?'プレイ時間':'生存スコア';
  $('result-score').textContent=result.mode==='hb'?fmtLong(result.seconds):result.score.toLocaleString('ja-JP');
  const r=this.data.records;
  const newBest=result.mode==='hb'&&result.won&&(r.hbBest===null||result.seconds<r.hbBest)||result.mode==='endless'&&result.score>r.endlessBest;
  $('result-extra').textContent=(newBest?'★ 自己ベスト候補！ ／ ':'')+
   (result.mode==='hb'?'回収 '+result.food.toFixed(1)+' / 10.0 個分':'生存時間 '+fmtLong(result.seconds));
  $('score-save-form').hidden=false;$('score-save-confirmation').hidden=true;$('result-next-actions').hidden=true;
  $('score-player-name').value=this.data.lastPlayerName||'';
  $('result-retry').textContent='もう一度遊ぶ →';
  this.refreshNamePreview();this.show('result');
  $('score-player-name').focus({preventScroll:true});
 }
 refreshNamePreview(){
  const input=$('score-player-name');const cleaned=Array.from(input.value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')).slice(0,16).join('');
  if(input.value!==cleaned)input.value=cleaned;
  $('score-preview-name').textContent=cleanName(input.value);
  const r=this.pendingResult;
  $('score-preview-result').textContent=r?(r.mode==='hb'?fmtLong(r.seconds):r.score.toLocaleString('ja-JP')+'点'):'';
 }
 saveResult(){
  if(!this.pendingResult)return;
  const r=this.pendingResult,rawName=$('score-player-name').value.trim(),name=cleanName(rawName);
  const rec=this.data.records;
  const entry={id:'record-'+Date.now()+'-'+Math.random().toString(36).slice(2),name,mode:r.mode,won:r.won,
   seconds:safeNumber(r.seconds,9999999),score:safeInt(r.score),food:safeNumber(r.food,1000),date:new Date().toISOString(),legacy:false};
  rec.entries.unshift(entry);rec.entries=rec.entries.slice(0,MAX_ENTRIES);
  rec.plays++;
  if(r.mode==='endless')rec.endlessBest=Math.max(rec.endlessBest,r.score);
  if(r.mode==='hb'&&r.won){rec.hbClears++;if(rec.hbBest===null||r.seconds<rec.hbBest)rec.hbBest=r.seconds;}
  if(name!=='unknown')this.data.lastPlayerName=name;
  const ok=this.save();
  this.pendingResult=null;this.paintRecords();
  this.finishResult(ok?name+' の記録を保存しました。ランキングから確認できます。':'保存に失敗しました。JSONバックアップの書き出しをお試しください。');
 }
 skipResult(){
  if(!this.pendingResult)return;
  this.pendingResult=null;
  this.finishResult('今回は保存しませんでした。ランキングに登録されません。');
 }
 finishResult(message){
  $('score-save-form').hidden=true;$('score-save-confirmation').textContent=message;
  $('score-save-confirmation').hidden=false;$('result-next-actions').hidden=false;
  $('result-retry').focus({preventScroll:true});
 }
 tutorialComplete(){
  this.pendingResult=null;this.lastMode='tutorial';
  $('result-eyebrow').textContent='TUTORIAL COMPLETE';$('result-symbol').textContent='✓';$('result-symbol').style.color='var(--green)';
  $('result-title').textContent='練習完了！';$('result-message').textContent='移動・回収・ダッシュ重ね掛け・被弾後の無敵を覚えました。';
  $('result-score-label').textContent='次はゲーム本編へ';$('result-score').textContent='READY!';
  $('result-extra').textContent='記録されるのは本編のプレイ結果のみです。';
  $('score-save-form').hidden=true;$('score-save-confirmation').hidden=true;$('result-next-actions').hidden=false;
  $('result-retry').textContent='HBモードで遊ぶ →';this.show('result');
 }
 applySettings(){
  const s=this.data.settings;
  for(const [id,value] of [['setting-music',s.music],['setting-sfx',s.sfx],['setting-hints',s.hints],['setting-hitboxes',s.showHitboxes],['setting-motion',s.reducedMotion]])$(id).checked=value;
  $('play-hitboxes').checked=s.showHitboxes;$('hitbox-live-status').textContent=s.showHitboxes?'ON':'OFF';$('setting-volume').value=String(s.volume);$('volume-output').textContent=s.volume+'%';document.querySelector('.tip-box').hidden=!s.hints;this.audio.setVolume(s.volume/100);this.audio.setEnabled(s.music,s.sfx);this.controls?.applySettings(s);
  $('setting-touch-visible').value=s.touchVisible;
  $('setting-touch-type').value=s.touchType;
  $('setting-touch-side').value=s.touchSide;
  $('setting-stick-deadzone').value=String(s.stickDeadzone);
  $('setting-stick-output').textContent=s.stickDeadzone+'%';
 }
 setHitboxes(checked){this.data.settings.showHitboxes=Boolean(checked);this.syncSettings();if(this.game.running)this.game.draw();}
 syncSettings(){this.applySettings();this.save();this.game.settings={hints:this.data.settings.hints,reducedMotion:this.data.settings.reducedMotion,showHitboxes:this.data.settings.showHitboxes};}
 save(){try{localStorage.setItem(KEY,JSON.stringify(this.data));this.storageAvailable=true;return true;}catch(error){this.storageAvailable=false;console.warn('Saving failed',error);return false;}}
 setRankMode(mode){this.rankMode=mode==='hb'?'hb':'endless';this.paintRanking();}
 rankingRows(){
  const mode=this.rankMode;
  let entries=this.data.records.entries.filter(e=>e.mode===mode&&(mode==='endless'||e.won));
  entries.sort((a,b)=>mode==='endless'?b.score-a.score||b.seconds-a.seconds:a.seconds-b.seconds||b.score-a.score);
  if($('rank-view').value==='players'){
   const found=new Set();entries=entries.filter(e=>{
    if(e.name==='unknown')return true;
    const id=e.name.toLocaleLowerCase('ja-JP');if(found.has(id))return false;found.add(id);return true;
   });
  }
  return entries.slice(0,100);
 }
 paintRanking(){
  for(const mode of ['hb','endless']){
   const button=$('rank-'+mode),active=this.rankMode===mode;
   button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  $('ranking-metric').textContent=this.rankMode==='hb'?'クリアタイム':'生存スコア';
  const body=$('ranking-list');body.replaceChildren();
  const entries=this.rankingRows();
  if(entries.length===0){const cell=body.insertRow().insertCell();cell.colSpan=4;cell.textContent='このモードの記録はまだありません';return;}
  entries.forEach((e,i)=>{
   const row=body.insertRow();
   const fields=[String(i+1),e.name,this.rankMode==='hb'?fmtLong(e.seconds):e.score.toLocaleString('ja-JP'),dateText(e.date)];
   for(const value of fields)row.insertCell().textContent=value;
   if(i===0)row.classList.add('ranking-first');
  });
 }
 paintRecords(){
  const r=this.data.records;
  $('record-endless').textContent=r.endlessBest.toLocaleString('ja-JP');
  $('record-hb').textContent=r.hbBest===null?'--:--':fmtLong(r.hbBest);
  $('record-plays').textContent=r.plays.toLocaleString('ja-JP');
  $('record-clears').textContent=r.hbClears.toLocaleString('ja-JP');
  this.paintRanking();
  const body=$('history-list');body.replaceChildren();
  if(r.entries.length===0){const row=body.insertRow();const cell=row.insertCell();cell.colSpan=5;cell.textContent='まだ記録がありません';}
  for(const item of r.entries.slice(0,100)){
   const row=body.insertRow();
   const fields=[dateText(item.date),item.name,item.mode==='hb'?'HB':'エンドレス',item.mode==='hb'?(item.won?'クリア':'ゲームオーバー'):'終了',
    item.mode==='hb'?(item.food.toFixed(1)+'個分 / '+fmtLong(item.seconds)):item.score.toLocaleString('ja-JP')+'点 / '+fmtLong(item.seconds)];
   for(const value of fields)row.insertCell().textContent=value;
  }
  $('raw-storage').textContent=JSON.stringify(this.data,null,2);
  $('storage-message').textContent=this.storageAvailable?'保存先：localStorage（この端末・ブラウザのみ）':'注意：ブラウザの保存機能を使用できません。';
 }
 exportData(){
  const blob=new Blob([JSON.stringify(this.data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='snack-and-dash-save-v2.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  $('storage-message').textContent='セーブデータを書き出しました。';
 }
 async importData(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(file.size>2_000_000){$('storage-message').textContent='2MBを超えるJSONは読み込めません。';return;}
  try{const parsed=JSON.parse(await file.text()),clean=normalize(parsed);
   if(!window.confirm('現在の記録と設定を、読み込んだデータに置き換えますか？'))return;
   this.data=clean;this.save();this.applySettings();this.paintRecords();$('storage-message').textContent='セーブデータを読み込みました。';
  }catch(err){$('storage-message').textContent='読み込み失敗：'+err.message;}
 }
 clearData(){
  if(!window.confirm('記録と設定をすべて初期化します。よろしいですか？'))return;
  this.data=defaultData();this.save();this.applySettings();this.paintRecords();$('storage-message').textContent='データを初期化しました。';
 }
}
window.SSGApp=new App();
})();
