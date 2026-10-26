// The engine synthesizer (H-7): a reference engine-sound prototype's synthesizer, ported with three
// changes: noise comes from a per-instance mulberry32 PRNG seeded by options.seed (U-6 clarification, H-5); the MIC and
// muffler tables are instance fields, not static ones; and with `on` 0 and the output gate closed, a block renders zeros
// without running the model. The class names nothing outside itself: createDsp runs it from its own source text in an
// AudioWorklet (H-5).
export class EngineDSP {
  static bq(){ return {b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0}; }
  static set(f,type,freq,Q,sr,gainDb){
    const w=2*Math.PI*Math.min(Math.max(freq,10),sr*0.45)/sr, c=Math.cos(w), s=Math.sin(w), al=s/(2*Q);
    let b0,b1,b2,a0,a1,a2;
    if(type===0){ b0=(1-c)/2; b1=1-c; b2=(1-c)/2; a0=1+al; a1=-2*c; a2=1-al; }
    else if(type===1){ b0=al; b1=0; b2=-al; a0=1+al; a1=-2*c; a2=1-al; }
    else { const A=Math.pow(10,(gainDb||0)/40); b0=1+al*A; b1=-2*c; b2=1-al*A; a0=1+al/A; a1=-2*c; a2=1-al/A; }
    f.b0=b0/a0; f.b1=b1/a0; f.b2=b2/a0; f.a1=a1/a0; f.a2=a2/a0;
  }
  static run(f,x){ const y=f.b0*x+f.b1*f.x1+f.b2*f.x2-f.a1*f.y1-f.a2*f.y2; f.x2=f.x1; f.x1=x; f.y2=f.y1; f.y1=y; return y; }

  constructor(sr,{seed=1}={}){
    this.sr=sr; this.seed=(seed>>>0)||1;
    // tables live on the instance, not as static fields: a bundler targeting ES2020 moves static fields out of the class,
    // and the worklet runs this class from its own source text (H-5)
    this.MIC=[
    {exh:1.0, int:0.22, tur:0.5,  mech:0.3,  st:0.45, exLP:16000, cab:0},
    {exh:0.32,int:1.0,  tur:1.15, mech:0.75, st:1.0,  exLP:1700,  cab:0},
    {exh:0.8, int:0.5,  tur:0.35, mech:0.3,  st:0.5,  exLP:16000, cab:1}
  ];
    this.MUF=[1300,3200,7000]; this.BRIGHT=[0.15,0.5,1.0]; this.BODY_DB=[5,3.5,2];
    this.t={rpm:0,charge:0.3,throttle:0,fuelCut:1,limiter:0,popWin:0,pops:1,turbo:0,shaft:0,boostN:0,wg:0,
            bovId:0,bovAmp:0,bovMode:1,mic:0,vol:0.6,pipe:2.1,muffler:1,on:0,starter:0,
            mixEx:1,mixOv:1,mixIn:1,mixTu:1,mixMe:1,mixSt:1};
    this.rpm=0; this.charge=0.3; this.thr=0; this.shaft=0; this.boostN=0; this.wg=0; this.onG=0;
    this.phase=0;
    this.voices=[]; for(let i=0;i<48;i++) this.voices.push({on:false,t:0,dur:1,a:0.1,amp:0,bank:0,delay:0,rasp:0});
    this.dl=[new Float32Array(16384),new Float32Array(16384)]; this.dw=0;
    this.N=[420,435]; this.loop=[0,0]; this.dcx=[0,0]; this.dcy=[0,0]; this.px=[0,0]; this.exLP=[0,0];
    const B=EngineDSP.bq;
    this.muf=[B(),B()]; this.muf2=[B(),B()]; this.body=[B(),B()]; this.cab=[B(),B()];
    this.crack=[0,0]; this.rEnv=[0,0]; this.rLP=[0,0]; this.rHP=[0,0];
    this.inRes=B(); this.inNz=B(); this.inEnv=0; this.inDc=0;
    this.whPh=0; this.whoosh=B(); this.wgF=B(); this.bovF=B(); this.bovT=9; this.bovA=0; this.bovMode=1; this.lastBov=0; this.flPh=0;
    this.clk=0; this.clkA=0; this.nPrev=0; this.stPh=0;
    this.stG=0; this.crankD=0; this.load=0; this.lastSt=0; this.clunk=0; this.thump=0; this.thPh=0; this.arPh=0; this.mshF=0;
    this.arLP=B(); EngineDSP.set(this.arLP,0,650,0.9,sr);
    this.hiss=B(); EngineDSP.set(this.hiss,1,2200,1.2,sr); this.mLP=0; this.chPh=0;
    this.stLP=B(); this.stBP=B(); this.ckBP=B(); EngineDSP.set(this.stLP,0,1600,0.8,sr); EngineDSP.set(this.stBP,1,1900,1.3,sr); EngineDSP.set(this.ckBP,1,850,2.2,sr);
    this.tk1=B(); this.tk2=B(); EngineDSP.set(this.tk1,1,2900,9,sr); EngineDSP.set(this.tk2,1,4700,7,sr);
    this.setEngine({angles:[0,180,360,540],banks:[0,1,0,1],header:[0,0,0,0],pulseDeg:230,gain:1,stereo:0});
  }
  rnd(){ const s=this.seed=(this.seed+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }
  setParams(m){ if(m && m.type==='engine') this.setEngine(m); else Object.assign(this.t,m); }
  setEngine(e){
    const nc=e.angles.length, cylVar=[], durVar=[];
    for(let i=0;i<nc;i++){
      const h=Math.sin((i+1)*12.9898+nc*78.233)*43758.5453, r=h-Math.floor(h);
      const h2=Math.sin((i+1)*39.346+nc*11.135)*24634.6345, r2=h2-Math.floor(h2);
      cylVar.push(1+0.16*(r-0.5)); durVar.push(1+0.12*(r2-0.5));
    }
    this.engine={angles:e.angles.map(a=>((a%720)+720)%720/720), banks:e.banks.slice(), header:e.header.slice(),
                 pulseDeg:e.pulseDeg, gain:e.gain, stereo:e.stereo, cylVar, durVar};
  }
  fire(c){
    const T=this.t, E=this.engine, sr=this.sr, rpm=Math.max(60,this.rpm);
    let amp=Math.pow(this.charge,0.75)*E.cylVar[c];
    const cv=0.05+0.25*Math.max(0,1-this.charge);
    amp*=1+cv*(this.rnd()*2-1);
    let pop=false, burned=!(T.fuelCut>0.5);
    if(burned && T.limiter && this.rnd()<0.65) burned=false;
    if(!burned){
      if(T.starter) amp*=0.55;
      else if(T.fuelCut>0.5) amp=(0.65)*(0.24+0.3*Math.min(1,this.rpm/6000))*E.cylVar[c]*(0.9+0.2*this.rnd())*T.mixOv; // fuel cut: no combustion, but each piston still pumps a cylinder of air out
      else amp*=0.2;
      if(T.starter) this.thump=Math.max(this.thump,0.7+0.3*this.rnd());
      const pp=T.limiter?0.3:0.2*T.popWin;
      if(T.pops && T.on && this.rnd()<pp){ pop=true; amp=0.7+this.rnd()*1.3; }
    }
    let v=null; const vs=this.voices; for(let i=0;i<vs.length;i++){ if(!vs[i].on){ v=vs[i]; break; } }
    if(!v) return;
    const dur=Math.max(24,E.pulseDeg*E.durVar[c]/(6*rpm)*sr*(pop?0.5:1));
    v.on=true; v.t=0; v.dur=dur; v.a=Math.min(0.3,Math.max(0.04,(0.0016*sr)/dur));
    v.amp=amp*E.gain; v.bank=E.banks[c];
    v.delay=Math.floor(E.header[c]*0.001*sr+this.rnd()*0.00012*sr);
    v.rasp=pop?1.4:0.7*Math.pow(Math.min(1,(this.rpm/6000)*this.charge),0.7);
    if(pop) this.crack[v.bank]=Math.max(this.crack[v.bank],0.5+0.7*this.rnd());
    this.clk=1; this.clkA=0.6+0.4*this.rnd();
  }
  render(L,R,n){
    const sr=this.sr, T=this.t, run=EngineDSP.run, set=EngineDSP.set;
    const kSt=1-Math.exp(-1/(sr*0.03)), ckD=Math.exp(-1/(sr*0.014)), thD=Math.exp(-1/(sr*0.06)), k=1-Math.exp(-1/(sr*0.012)), kOn=1-Math.exp(-1/(sr*0.15)), cDecay=Math.exp(-1/(sr*0.04));
    for(let off=0;off<n;off+=64){
      const m=Math.min(64,n-off), E=this.engine;
      if(!T.on && this.onG<1e-4){ this.onG=0; for(let i=0;i<m;i++){ L[off+i]=0; if(R) R[off+i]=0; } continue; } // H-7: silent: skip the model
      const turb=T.turbo?1:0, mi=T.muffler|0;
      const mufCut=this.MUF[mi]*(1-0.35*turb);
      const bright=this.BRIGHT[mi]*(1-0.4*turb);
      for(let b=0;b<2;b++){
        set(this.muf[b],0,mufCut,0.65,sr);
        set(this.muf2[b],0,mufCut*1.6,0.6,sr);
        set(this.body[b],2,210/Math.max(0.6,T.pipe)*(b?0.96:1),1.4,sr,this.BODY_DB[mi]);
      }
      set(this.inRes,1,120+this.rpm*0.025,2.5,sr);
      set(this.inNz,1,650+this.rpm*0.08,1.1,sr);
      set(this.whoosh,1,1800+2800*this.shaft,0.9,sr);
      set(this.wgF,1,2600,0.7,sr);
      if(this.bovMode) set(this.bovF,1,900+3000*Math.exp(-this.bovT*5),1.2,sr);
      else set(this.bovF,1,1250+300*Math.exp(-this.bovT*3),1.4,sr);
      const mic=this.MIC[T.mic|0]||this.MIC[0];
      const exA=1-Math.exp(-2*Math.PI*mic.exLP/sr);
      if(mic.cab){ set(this.cab[0],0,750,0.75,sr); set(this.cab[1],0,750,0.75,sr); }
      const nT0=2*T.pipe/480*sr, nT1=2*T.pipe*1.035/480*sr;
      const ang=E.angles, nc=ang.length;
      for(let i=0;i<m;i++){
        this.rpm+=(T.rpm-this.rpm)*k; this.charge+=(T.charge-this.charge)*k; this.thr+=(T.throttle-this.thr)*k;
        this.shaft+=(T.shaft-this.shaft)*k; this.boostN+=(T.boostN-this.boostN)*k; this.wg+=(T.wg-this.wg)*k;
        this.onG+=((T.on?1:0)-this.onG)*kOn;
        const rpm=this.rpm;
        // crank phase over the 720° cycle; fire pulses on crossing
        // cranking: each compression stroke loads the starter, slowing the crank just before TDC, then the trapped air pushes it on
        const stOn=T.starter?1:0; this.stG+=(stOn-this.stG)*kSt;
        if(stOn&&!this.lastSt) this.clunk=1;
        this.lastSt=stOn;
        this.crankD+=((stOn?0.38*Math.max(0,Math.min(1,1-rpm/520)):0)-this.crankD)*kSt;
        let spd=rpm;
        if(this.crankD>1e-4){ let sum=0;
          for(let c=0;c<nc;c++){ let d=this.phase-(ang[c]-0.03); d-=Math.round(d); const q=d/0.065; sum+=Math.exp(-q*q); }
          this.load=Math.min(1,sum); spd=rpm*(1-this.crankD*this.load);
        } else this.load=0;
        const prev=this.phase; let ph=prev+spd/120/sr;
        if(ph>=1){ for(let c=0;c<nc;c++) if(ang[c]>prev) this.fire(c); ph-=1; for(let c=0;c<nc;c++) if(ang[c]<=ph) this.fire(c); }
        else if(rpm>1){ for(let c=0;c<nc;c++){ const a=ang[c]; if(a>prev&&a<=ph) this.fire(c); } }
        this.phase=ph;
        // pulse voices
        let p0=0,p1=0,n0=0,n1=0; const vs=this.voices;
        for(let j=0;j<vs.length;j++){ const v=vs[j]; if(!v.on) continue;
          if(v.delay>0){ v.delay--; continue; }
          const x=v.t/v.dur; if(x>=1){ v.on=false; continue; }
          const u=x/v.a, y=u*Math.exp(1-u)*(1-x);
          const s=v.amp*y, ns=s*v.rasp;
          if(v.bank){ p1+=s; n1+=ns; } else { p0+=s; n0+=ns; }
          v.t++;
        }
        // afterfire crackle
        for(let b=0;b<2;b++){ const c=this.crack[b]; if(c>1e-3){
          let s=(this.rnd()*2-1)*c*0.5; if(this.rnd()<0.006) s+=(this.rnd()<0.5?-1:1)*c*2.2;
          if(b) p1+=s; else p0+=s; this.crack[b]*=cDecay; } }
        const pin=p0+p1;
        // exhaust chain per bank
        let e0=0,e1=0; const drv=1.1+1.4*Math.min(1.6,this.charge);
        for(let b=0;b<2;b++){
          const x=b?p1:p0;
          const y0=x-this.dcx[b]+0.997*this.dcy[b]; this.dcx[b]=x; this.dcy[b]=y0;
          const d=y0-this.px[b]; this.px[b]=y0;
          let y=y0+bright*6*d;
          this.N[b]+=((b?nT1:nT0)-this.N[b])*0.0005;
          const dlb=this.dl[b], ri=this.dw-this.N[b], i0=Math.floor(ri), fr=ri-i0;
          const r0=dlb[i0&16383], r1=dlb[(i0+1)&16383];
          this.loop[b]+=(r0+(r1-r0)*fr-this.loop[b])*0.42;
          y=y-0.5*this.loop[b];
          dlb[this.dw]=y;
          // flow turbulence: band-limited (~270 Hz–1.7 kHz), envelope-smoothed, added after the pipe so it can’t ring the pipe modes
          this.rEnv[b]+=((b?n1:n0)-this.rEnv[b])*0.02;
          const wn=this.rnd()*2-1; this.rLP[b]+=(wn-this.rLP[b])*0.2; this.rHP[b]+=(this.rLP[b]-this.rHP[b])*0.035;
          y+=(this.rLP[b]-this.rHP[b])*this.rEnv[b]*1.6;
          y=run(this.muf[b],y); y=run(this.muf2[b],y); y=run(this.body[b],y);
          y=Math.tanh(y*0.45*drv);
          this.exLP[b]+=(y-this.exLP[b])*exA;
          if(b) e1=this.exLP[b]; else e0=this.exLP[b];
        }
        this.dw=(this.dw+1)&16383;
        // intake
        const id=pin-this.inDc; this.inDc+=id*0.002;
        this.inEnv+=(Math.abs(id)-this.inEnv)*0.01;
        const nz=this.rnd()*2-1;
        let intake=run(this.inRes,id)*(0.25+0.75*this.thr)*0.8;
        intake+=run(this.inNz,nz)*this.inEnv*this.thr*Math.min(1,rpm/3500)*2.2;
        // closed-throttle hiss: air rushing past the throttle plate into manifold vacuum
        intake+=run(this.hiss,this.rnd()*2-1)*Math.max(0,1-this.charge)*(1-this.thr)*Math.min(1,rpm/5000)*0.12*T.mixOv;
        // mechanical + starter
        // valvetrain tick: a short noise burst ringing two metallic resonances, varied per event, fading under combustion noise as rpm rises
        const tex=nz*this.clk*this.clkA; this.clk*=0.96;
        let mech=(run(this.tk1,tex)+0.6*run(this.tk2,tex))*0.2/(1+rpm/2500);
        // engine body: rotating-mass rumble and timing-drive whir that are there whenever the engine spins, fuel or not
        const rn=Math.min(1.4,rpm/6000); this.chPh+=rpm/60*21/sr; if(this.chPh>1) this.chPh-=1;
        this.mLP+=(nz-this.mLP)*0.08;
        mech+=(this.mLP*1.6+Math.sin(2*Math.PI*this.chPh)*0.12)*Math.pow(rn,1.3)*0.35;
        let strt=0;
        if(this.stG>1e-3){
          // overrunning clutch: once the engine outruns the starter, the starter drops away instead of chasing rpm
          const free=Math.max(0,Math.min(1,(380-rpm)/80)), ld=this.load;
          // the "lug": the motor growls at its own rotation rate (~11x crank), louder and lower each time a cylinder compresses
          this.arPh+=Math.min(spd,330)/60*11/sr; if(this.arPh>1) this.arPh-=1;
          const s1=Math.sin(2*Math.PI*this.arPh);
          const growl=run(this.arLP,Math.tanh(3*s1)+0.6*(2*((this.arPh*2)%1)-1)+0.25*nz);
          // ring-gear mesh: quiet, and only gently pitch-bent so it can't swoop into a wheeze
          this.mshF+=(Math.min(rpm,330)*(1-0.3*this.crankD*ld)/60*120-this.mshF)*0.002;
          this.stPh+=this.mshF/sr; if(this.stPh>1) this.stPh-=1;
          const mesh=run(this.stLP,2*this.stPh-1);
          const comm=run(this.stBP,this.rnd()*2-1);
          strt+=(growl*0.11*(0.12+1.1*ld)+mesh*0.028*(0.6+0.4*ld)+comm*0.04*(0.4+0.6*ld))*this.stG*free;
        }
        if(this.clunk>1e-3){ strt+=run(this.ckBP,nz)*this.clunk*0.6+Math.sin(this.clunk*40)*this.clunk*0.15; this.clunk*=ckD; }
        if(this.thump>1e-3){ this.thPh+=34/sr; strt+=Math.sin(2*Math.PI*this.thPh)*this.thump*0.22; this.thump*=thD; } else this.thPh=0;
        // turbo
        let tur=0;
        if(turb){ const sh=this.shaft;
          this.whPh+=(380+4400*sh)/sr; if(this.whPh>1) this.whPh-=1;
          const w=Math.sin(2*Math.PI*this.whPh)+0.3*Math.sin(4*Math.PI*this.whPh+0.7);
          tur+=w*sh*sh*(0.2+0.8*Math.min(1,this.thr))*0.09;
          tur+=run(this.whoosh,nz)*sh*(0.15+this.boostN)*0.22;
          tur+=run(this.wgF,this.rnd()*2-1)*this.wg*0.12;
        }
        if(T.bovId!==this.lastBov){ this.lastBov=T.bovId; this.bovT=0; this.bovA=T.bovAmp; this.bovMode=T.bovMode; this.flPh=0; }
        if(this.bovT<2.5){ const t=this.bovT, att=Math.min(1,t/0.004);
          if(this.bovMode){ tur+=run(this.bovF,this.rnd()*2-1)*this.bovA*att*Math.exp(-t/0.28)*0.9; }
          else { const f=24*(1-0.45*Math.min(1,t)); this.flPh+=f/sr; if(this.flPh>1) this.flPh-=1;
            const sn=Math.sin(2*Math.PI*this.flPh), am=0.5+0.5*Math.tanh(5*sn), env=this.bovA*att*Math.exp(-t/0.45);
            tur+=run(this.bovF,this.rnd()*2-1)*env*am*1.1+sn*env*0.08; }
          this.bovT+=1/sr; }
        // mix
        const center=intake*mic.int*T.mixIn+mech*mic.mech*T.mixMe+tur*mic.tur*T.mixTu+strt*mic.st*T.mixSt;
        const exG=mic.exh*T.mixEx; let l,r;
        if(E.stereo){ l=(e0*0.82+e1*0.3)*exG+center; r=(e1*0.82+e0*0.3)*exG+center; }
        else { const e=(e0+e1)*0.62*exG; l=e+center; r=e+center; }
        if(mic.cab){ l=run(this.cab[0],l)*1.5; r=run(this.cab[1],r)*1.5; }
        const g=T.vol*this.onG*1.2;
        l=Math.tanh(l*g); r=Math.tanh(r*g);
        if(R){ L[off+i]=l; R[off+i]=r; } else L[off+i]=(l+r)*0.5;
      }
    }
  }
}

// The configuration message for a powertrain preset.
export const engineConfig = s => ({ type: 'engine', angles: s.angles, banks: s.banks, header: s.header, pulseDeg: s.pulseDeg, gain: s.gain, stereo: s.stereo });
