(function () {
 'use strict';
 const frequency = (note) => {
   const match = /^([A-G])([#b]?)(\d)$/.exec(note);
   if(!match)return 440;
   const noteOffsets={C:-9,D:-7,E:-5,F:-4,G:-2,A:0,B:2};
   const semitone=noteOffsets[match[1]]+(match[2]==='#'?1:match[2]==='b'?-1:0)+(Number(match[3])-4)*12;
   return 440*Math.pow(2,semitone/12);
 };
 class GameAudio {
  constructor(){this.context=null;this.master=null;this.engine='none';this.tone=null;this.synths={};this.ready=false;this.musicEnabled=true;this.sfxEnabled=true;this.volume=.5;this.loop=null;this.beat=0;this.playing=false;
   this.notes=['C5','E5','G5','E5','D5','F5','A5','G5','E5','G5','B5','G5','A5','G5','E5','D5'];
  }
  async init(){
   if(this.ready){ if(this.engine==='native'&&this.context?.state==='suspended')await this.context.resume().catch(()=>{}); return; }
   if(window.Tone){
    try{
     await window.Tone.start();
     const T=window.Tone;
     this.tone=T;
     this.master=new T.Volume(-11).toDestination();
     for(const type of ['square','triangle','sawtooth','sine']){
      this.synths[type]=new T.PolySynth(T.Synth,{oscillator:{type},envelope:{attack:.003,decay:.08,sustain:0,release:.12}}).connect(this.master);
     }
     this.engine='tone';this.ready=true;this.setVolume(this.volume);return;
    }catch(error){console.warn('Tone.js unavailable, falling back to native audio',error);this.disposeTone();}
   }
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context)return;
   try{
     this.context=new Context();this.master=this.context.createGain();this.master.connect(this.context.destination);
     await this.context.resume();this.engine='native';this.ready=true;this.setVolume(this.volume);
   }catch(error){console.warn('Audio is unavailable',error);}
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(!this.master)return;
   if(this.engine==='tone'){this.master.volume.value=this.volume===0?-80:(-11+20*Math.log10(this.volume/.5));}
   else if(this.engine==='native'){this.master.gain.value=.28*this.volume;}
  }
  setEnabled(music,sfx){this.musicEnabled=Boolean(music);this.sfxEnabled=Boolean(sfx);}
  toneNote(note,duration=.1,type='square',gain=.55,delay=0,sweep=0){
   if(!this.ready)return;
   const freq=typeof note==='number'?note:frequency(note);
   if(this.engine==='tone'){
    try{this.synths[type]?.triggerAttackRelease(freq,Math.max(.012,duration),this.tone.now()+Math.max(0,delay),Math.min(.9,Math.max(.02,gain)));}catch(error){console.warn('Tone note error',error);}
    return;
   }
   if(this.engine!=='native')return;
   const c=this.context, at=c.currentTime+Math.max(0,delay);
   const osc=c.createOscillator(), vol=c.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,at);
   if(sweep!==0)osc.frequency.exponentialRampToValueAtTime(Math.max(35,freq+sweep),at+Math.max(.04,duration));
   vol.gain.setValueAtTime(.0001,at);vol.gain.exponentialRampToValueAtTime(Math.max(.0002,gain*.22),at+.009);vol.gain.exponentialRampToValueAtTime(.0001,at+duration+.045);
   osc.connect(vol);vol.connect(this.master);osc.start(at);osc.stop(at+duration+.07);
  }
  noise(duration=.11,gain=.23){
   if(!this.ready)return;
   if(this.engine==='tone'){this.toneNote(98,.10,'sawtooth',gain);return;}
   if(this.engine!=='native')return;
   const c=this.context,n=Math.floor(c.sampleRate*duration),buffer=c.createBuffer(1,n,c.sampleRate),channel=buffer.getChannelData(0);
   for(let i=0;i<n;i++)channel[i]=(Math.random()*2-1)*(1-i/n);
   const source=c.createBufferSource(),vol=c.createGain();source.buffer=buffer;vol.gain.value=gain*.28;source.connect(vol);vol.connect(this.master);source.start();
  }
  effect(name){
   if(!this.ready||!this.sfxEnabled)return;
   switch(name){
    case 'move':this.toneNote('G4',.045,'square',.16);break;
    case 'select':this.toneNote('C5',.08,'square',.32);this.toneNote('E5',.12,'triangle',.37,.075);break;
    case 'pickup':this.toneNote('E5',.08,'triangle',.5);this.toneNote('G5',.14,'triangle',.55,.09);break;
    case 'premium': ['C5','E5','G5','B5','C6','E6'].forEach((n,i)=>this.toneNote(n,.16,'triangle',.48,i*.072));this.toneNote('C4',.35,'sine',.32,.21);break;
    case 'goldSpawn':this.toneNote('E5',.06,'triangle',.2);this.toneNote('B5',.12,'triangle',.25,.11);break;
    case 'dash':this.toneNote(220,.16,'sawtooth',.32,0,580);this.toneNote('G5',.075,'triangle',.32,.07);break;
    case 'hit':this.noise(.17,.6);this.toneNote(156,.24,'sawtooth',.3,0,-65);break;
    case 'life':this.toneNote('C5',.12,'triangle',.35);this.toneNote('C6',.20,'triangle',.45,.13);break;
    case 'clear': ['C5','E5','G5','C6','E6'].forEach((n,i)=>this.toneNote(n,.3,'triangle',.53,i*.12));break;
    case 'lose':['E4','D4','C4','G3'].forEach((n,i)=>this.toneNote(n,.26,'triangle',.52,i*.18));break;
    case 'warning':this.toneNote('A3',.08,'square',.22);break;
   }
  }
  startMusic(){
   if(this.loop){clearInterval(this.loop);this.loop=null;}
   this.beat=0;this.playing=true;
   const perform=()=>{
    if(!this.playing||!this.ready||!this.musicEnabled)return;
    const i=this.beat++%this.notes.length;
    this.toneNote(this.notes[i],.09,'triangle',.12);
    if(i%4===0)this.toneNote('C3',.19,'square',.085);
    if(i%4===2)this.toneNote('G3',.11,'triangle',.07);
   };
   perform();this.loop=setInterval(perform,60000/138/2);
  }
  stopMusic(){this.playing=false;if(this.loop){clearInterval(this.loop);this.loop=null;}}
  disposeTone(){if(this.synths)Object.values(this.synths).forEach(s=>{try{s.dispose();}catch(_){}});this.synths={};try{this.master?.dispose();}catch(_){}this.master=null;this.tone=null;}
 }
 window.SSGAudio=GameAudio;
})();
