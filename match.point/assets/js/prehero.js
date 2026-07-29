/* ═══════════════════════════════════════════════════════════
   MATCH POINT — motion controller
   Fonte da verdade: Motion Design Blueprint v3.0 (aprovado).
   A carta do movimento vive em css/prehero.css — leia antes de
   adicionar qualquer animação aqui.

   Sem frameworks: split de título + preloader/door-split handoff +
   um único rAF alimentando parallax inercial e a saída do palco.
   Verbo do movimento: "pousar" (settle).
   ═══════════════════════════════════════════════════════════ */
(function(){
'use strict';

var root=document.documentElement;
root.classList.remove('no-js');root.classList.add('js');

var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var fine=matchMedia('(pointer:fine)').matches;

/* rolagem de âncora em andamento (MOV-05): a nav não recolhe durante
   um scroll programático, e um gesto do usuário o cancela.           */
var anchorTweening=false, anchorTweenId=0;

/* ── vocabulário de estado · Blueprint Parte XII (C1) ─────────
   Alinhado ao Design System oficial. Nunca escrever a string
   literal no corpo do código: renomear um estado deve ser uma
   edição em um único lugar, aqui.                              */
var STATE={
  active :'js--active',   /* [data-title] revelado (era 'is-in' até v2) */
  in     :'in',           /* [data-reveal] revelado                     */
  arrived:'is-arrived'    /* mídia decodificada e assentada (Arrival)   */
};

/* ── i18n · rótulos de acessibilidade injetados pelo JS ───────
   As três strings que este arquivo escreve em runtime (status do
   carrossel, menu, pausa da faixa) vivem aqui, chaveadas pelo
   lang do <html>. A página PT usa lang="pt-BR"; a EN, lang="en".
   Qualquer prefixo "en" → tabela inglesa; o resto cai no default. */
var LANG=(root.lang||'pt').toLowerCase().slice(0,2)==='en'?'en':'pt';
var I18N={
  pt:{
    flowStatus:function(n,total,step){return 'Etapa '+n+' de '+total+': '+step;},
    menuOpen:'Abrir menu', menuClose:'Fechar menu',
    stripPause:'Pausar movimento da faixa', stripResume:'Retomar movimento da faixa'
  },
  en:{
    flowStatus:function(n,total,step){return 'Step '+n+' of '+total+': '+step;},
    menuOpen:'Open menu', menuClose:'Close menu',
    stripPause:'Pause strip movement', stripResume:'Resume strip movement'
  }
}[LANG];

/* ── leitura de tokens de tempo · Blueprint Parte XV ──────────
   O CSS é a fonte única do tempo. O JS lê o token, nunca copia
   o número: um valor duplicado em dois arquivos diverge no
   primeiro ajuste, e a divergência é silenciosa.

   Retorna milissegundos. Token ausente → 0, que é a degradação
   correta: sem CSS não há coreografia pela qual esperar.        */
var ROOT_STYLE=getComputedStyle(root);   /* lido uma vez: tokens não mudam */
function ms(token){
  var v=ROOT_STYLE.getPropertyValue(token).trim();
  if(!v)return 0;
  return v.slice(-2)==='ms' ? parseFloat(v) : parseFloat(v)*1000;
}
/* leitura numérica crua de um token (px, %, unitless) → float.
   parseFloat('300px')=300 · parseFloat('-6%')=-6 · parseFloat('.12')=.12
   Token ausente → 0 (degradação segura: sem geometria, sem gesto).      */
function cssNum(token){return parseFloat(ROOT_STYLE.getPropertyValue(token))||0;}

/* ── split de título (DS title-animation · preserva <em>/<br>) ── */
document.querySelectorAll('[data-title]').forEach(function(el){
  var mode=el.getAttribute('data-split')||'chars';
  var stag=parseFloat(el.getAttribute('data-stagger')||'.05');
  var base=parseFloat(el.getAttribute('data-delay')||'0');
  var idx=0;
  function unitSpan(u){
    var wrap=document.createElement('span');wrap.className='t-wrap';
    var ch=document.createElement('span');ch.className='t-ch';
    ch.textContent=u;ch.style.transitionDelay=(base+(idx++)*stag)+'s';
    wrap.appendChild(ch);return wrap;
  }
  function spacer(){var sp=document.createElement('span');sp.className='t-wrap sp';sp.innerHTML='&nbsp;';return sp;}
  function splitInto(node){
    var frag=document.createDocumentFragment();
    [].slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===3){
        var text=child.textContent.replace(/\s+/g,' ');
        if(!text.trim()){if(text)frag.appendChild(spacer());return;}
        var lead=/^\s/.test(text),trail=/\s$/.test(text);
        var units=(mode==='words')?text.trim().split(/\s+/):text.trim().split('');
        if(lead)frag.appendChild(spacer());
        units.forEach(function(u,i){
          frag.appendChild(unitSpan(u));
          if(mode==='words'&&i<units.length-1)frag.appendChild(spacer());
        });
        if(trail)frag.appendChild(spacer());
      }else if(child.nodeType===1){
        if(child.tagName==='BR'){frag.appendChild(child.cloneNode());return;}
        var clone=child.cloneNode(false);
        clone.appendChild(splitInto(child));
        frag.appendChild(clone);
      }
    });
    return frag;
  }
  var out=splitInto(el);el.textContent='';el.appendChild(out);
});

/* ── entrada da cena ───────────────────────────────────────── */
var entered=false;
function enter(){
  if(entered)return;entered=true;
  document.body.classList.add('is-entered');
  document.querySelectorAll('#prehero [data-title]').forEach(function(t){t.classList.add(STATE.active);});
}

/* ── preloader → pré-Hero · handoff contínuo (door-split) ─────
   As portas abrem enquanto o pré-Hero já respira; enter() derrama
   os textos no mesmo instante, para o olho não achar a emenda.    */
var preloader=document.getElementById('preloader');
var fontsReady=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();

/* Timeline do handoff · lida dos tokens --pl-* (css/prehero.css).
   Ajustar o ritmo do preloader = editar o CSS, um lugar só.        */
var PL={
  reveal  : ms('--pl-reveal'),     /* coreografia completa → T0        */
  panel   : ms('--pl-panel-dur'),  /* portas abrindo                   */
  settle  : ms('--pl-settle'),     /* folga antes de .is-done          */
  reduced : ms('--pl-reduced'),    /* variante reduced-motion          */
  fallback: ms('--pl-fallback')    /* margem do fallback de segurança  */
};

function reveal(){
  if(!preloader||preloader.classList.contains('is-revealing'))return;
  preloader.classList.add('is-revealing');   /* portas abrem, marca cede */
  root.classList.remove('pl-lock');
  enter();                                    /* textos entram junto */
  try{sessionStorage.setItem('mp_seen','1');}catch(e){}   /* MOTION-01: marca a visita */
  setTimeout(function(){preloader.classList.add('is-done');},PL.panel+PL.settle);
}

function startPreloader(){
  if(!preloader){enter();return;}
  /* MOTION-01: revisita na mesma sessão → dispensa a abertura cinematográfica
     (door-split), só um fade rápido. A primeira visita segue completa.      */
  var seen=false;try{seen=sessionStorage.getItem('mp_seen')==='1';}catch(e){}
  if(seen){
    enter();
    preloader.style.transition='opacity 200ms linear';
    preloader.style.opacity='0';
    setTimeout(function(){preloader.classList.add('is-done');},220);
    return;
  }
  root.classList.add('pl-lock');
  if(reduce){                                 /* variante reduzida: breve pausa → fade */
    setTimeout(reveal,PL.reduced);
    return;
  }
  requestAnimationFrame(function(){preloader.classList.add('is-playing');});
  /* revela quando a coreografia termina E as fontes do herói estão prontas */
  Promise.all([fontsReady,new Promise(function(r){setTimeout(r,PL.reveal);})]).then(reveal);
  setTimeout(reveal,PL.reveal+PL.fallback);   /* fallback: nunca prende a cena */
}
startPreloader();

/* ── arrival das imagens (assenta ao decodificar) ──────────── */
[].slice.call(document.querySelectorAll('.prehero__img,.hero__media img,.banner__img,.card__img')).forEach(function(im){
  function settle(){
    im.classList.add(STATE.arrived);
    /* solta o will-change do arrival (opacity/filter). Mantém 'transform'
       só onde há movimento contínuo — Ken Burns ou parallax; os demais
       voltam a 'auto' [doutrina §15: will-change nunca é permanente].   */
    var segue=im.hasAttribute('data-parallax')||getComputedStyle(im).animationName!=='none';
    im.style.willChange=segue?'transform':'auto';
  }
  if(im.complete&&im.naturalWidth)settle();
  else{im.addEventListener('load',settle);im.addEventListener('error',settle);}
});

/* ── reveal on scroll · títulos (STATE.active) + blocos (STATE.in) ──
   One-shot por contrato [Parte XV]: o observer desconecta ao disparar.
   Texto que se move ao ser relido é texto que não pode ser lido.      */
if('IntersectionObserver' in window){
  var tio=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add(STATE.active);tio.unobserve(e.target);}
  });},{threshold:.25});
  document.querySelectorAll('[data-title]').forEach(function(el){
    if(el.closest('#prehero'))return;               /* pré-Hero entra via enter() */
    tio.observe(el);
  });
  /* ritmo do reveal de blocos irmãos [data-reveal] · P03-a (tokenizado)
     REVEAL_LEAD: suporte atrás do protagonista (Part II ~180ms; sem
     token dedicado — ver P09-a). REVEAL_STAGGER: cascata de irmãos.
     REVEAL_CAP: teto de itens escalonados (--stagger-cap).            */
  var REVEAL_STAGGER=ms('--stagger-word')/1000;      /* s · = --stagger-word */
  var REVEAL_CAP=cssNum('--stagger-cap')-1;          /* multiplicador máx    */
  var REVEAL_LEAD=0.15;                              /* s · lead do suporte  */
  var rio=new IntersectionObserver(function(es){es.forEach(function(e){
    if(!e.isIntersecting)return;
    var sibs=[].slice.call(e.target.parentNode.children).filter(function(n){return n.hasAttribute&&n.hasAttribute('data-reveal');});
    var i=sibs.indexOf(e.target);
    var sec=e.target.closest('section');
    var lead=(sec&&sec.querySelector('[data-title]'))?REVEAL_LEAD:0;
    e.target.style.transitionDelay=(lead+(i>0?Math.min(i,REVEAL_CAP)*REVEAL_STAGGER:0))+'s';
    e.target.classList.add(STATE.in);rio.unobserve(e.target);
  });},{threshold:.14,rootMargin:'0px 0px -6%'});
  document.querySelectorAll('[data-reveal]').forEach(function(el){rio.observe(el);});
}else{
  document.querySelectorAll('[data-title],[data-reveal]').forEach(function(el){el.classList.add(STATE.active,STATE.in);});
}

/* ── motor de movimento · um único rAF ─────────────────────── */
var parallax=document.getElementById('parallax');
var stage=document.getElementById('stage');
var scroll=document.getElementById('scroll');
/* Alvos de parallax pré-computados: a velocidade sai do atributo UMA vez,
   não a cada frame [Parte XV]. `zone` é o elemento cuja caixa é medida.   */
var heroPx=[].slice.call(document.querySelectorAll('[data-parallax]')).map(function(el){
  return {el:el, zone:el.parentNode, speed:parseFloat(el.getAttribute('data-parallax'))||.1, on:false, d:0};
});

/* alvos e estados suavizados (lerp = inércia contínua) */
var AMP_X=fine?22:0, AMP_Y=fine?15:0;
var tX=0,tY=0, cX=0,cY=0;      /* mouse: alvo → atual */
var running=false, lastY=-1, preheroVis=true;

/* ── saída do palco · MOV-06 (H6) · Blueprint Parte VII ───────
   A cena de abertura se retira no 1º scroll: recua --hero-exit-y
   e esmaece até --opacity-hero-exit, progressivo ao longo de
   --hero-exit-range. Declara "esta cena terminou" sem que o palco
   suma. Geometria 100% em token — nenhum pixel mágico.
   Em reduced-motion este bloco não roda (o rAF é gated por !reduce):
   o palco sai de vista pela rolagem natural, como manda a Parte XVI. */
var HERO_EXIT={
  range   : cssNum('--hero-exit-range'),   /* px do progresso 0→1      */
  y       : cssNum('--hero-exit-y'),        /* % de recuo do palco      */
  opacity : cssNum('--opacity-hero-exit'),  /* opacidade final do palco */
  parallax: cssNum('--parallax-deep')       /* parallax do fundo (deep) */
};
var SCROLL_CUE_FADE=HERO_EXIT.range*0.5;    /* indicador some na 1ª metade da saída */

function onMove(e){
  var nx=(e.clientX/innerWidth)*2-1;   /* -1 … 1 */
  var ny=(e.clientY/innerHeight)*2-1;
  tX=-nx*AMP_X; tY=-ny*AMP_Y;          /* inverso do cursor → profundidade */
}

function frame(){
  cX+=(tX-cX)*0.06; cY+=(tY-cY)*0.06;  /* assenta suave, sem overshoot */
  var y=scrollY, vh=innerHeight, i, t;
  var scrolling=(y!==lastY);

  /* ── FASE 1 · LEITURA (só ao rolar) ───────────────────────────
     t.d/t.on dependem da posição de scroll, NÃO do mouse. Durante a
     deriva de câmera (só cursor) o rect não muda → pulamos o
     getBoundingClientRect e evitamos layout síncrono por frame — é
     o que fazia a abertura travar quando o mouse se move junto com
     as transições de entrada.                                     */
  if(scrolling){
    for(i=0;i<heroPx.length;i++){
      t=heroPx[i];
      var r=t.zone.getBoundingClientRect();
      t.on=!(r.bottom<0||r.top>vh);      /* fora da viewport → não escreve */
      if(t.on)t.d=(r.top+r.height/2-vh/2)*t.speed;
    }
  }

  /* ── FASE 2 · ESCRITA ─────────────────────────────────────── */
  if(preheroVis){
    var scrollPx=y*HERO_EXIT.parallax;  /* parallax vertical do fundo (deep) */
    if(parallax)parallax.style.transform='translate3d('+cX.toFixed(2)+'px,'+(cY+scrollPx).toFixed(2)+'px,0)';
    if(scrolling){                      /* palco/indicador dependem só de y */
      if(stage){                        /* recua + esmaece (MOV-06) */
        var p=Math.min(y/HERO_EXIT.range,1);
        stage.style.transform='translate3d(0,'+(HERO_EXIT.y*p).toFixed(2)+'%,0)';
        stage.style.opacity=(1-(1-HERO_EXIT.opacity)*p).toFixed(3);
      }
      if(scroll)scroll.style.opacity=String(Math.max(0,1-y/SCROLL_CUE_FADE));
    }
  }
  if(scrolling){                        /* transform das imagens muda só no scroll */
    for(i=0;i<heroPx.length;i++){t=heroPx[i];if(t.on)t.el.style.transform='translate3d(0,'+t.d.toFixed(1)+'px,0)';}
  }

  lastY=y;
  var moved=Math.abs(tX-cX)>0.05||Math.abs(tY-cY)>0.05;
  if(moved||scrolling)requestAnimationFrame(frame);else running=false;
}
function kick(){if(!running&&!reduce){running=true;requestAnimationFrame(frame);}}

if(!reduce){
  addEventListener('scroll',kick,{passive:true});
  addEventListener('resize',kick,{passive:true});

  /* só escreve no palco do pré-Hero enquanto ele está à vista (perf) */
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      preheroVis=es[0].isIntersecting;if(preheroVis)kick();
    },{threshold:0}).observe(document.getElementById('prehero'));
  }
  kick();   /* uma passada inicial p/ assentar as posições de parallax */

  /* Deriva de câmera (cursor) é ambiente, não essencial: só entra DEPOIS
     da abertura, para o rAF não disputar a thread com as transições de
     entrada — nem que o usuário mexa o mouse durante o reveal.            */
  if(fine){
    setTimeout(function(){
      addEventListener('pointermove',function(e){onMove(e);kick();},{passive:true});
    },1200);
  }
}

/* ── rolagem de âncora · curva da marca (MOV-05 / H5) ────────
   Substitui o salto nativo por um tween com ease-out cúbico. O
   offset vem do scroll-margin-top da própria seção (--nav-clear,
   mesmo valor do CSS: os dois concordam por construção). Duração
   escalada pela distância, entre --dur-slow e --dur-anchor (teto).
   Cobre todos os a[href^="#"]: nav, indicador de rolagem, CTAs.
   href="#" (placeholders) e reduced-motion → nativo instantâneo.   */
function anchorEase(x){return 1-Math.pow(1-x,3);}
function tweenTo(target){
  var clear=parseFloat(getComputedStyle(target).scrollMarginTop)||0;
  var start=scrollY;
  var maxTop=document.documentElement.scrollHeight-innerHeight;
  var end=Math.max(0,Math.min(target.getBoundingClientRect().top+start-clear,maxTop));
  var dist=end-start;
  if(Math.abs(dist)<2)return;
  var dur=Math.min(ms('--dur-anchor'),Math.max(ms('--dur-slow'),Math.abs(dist)));
  var id=++anchorTweenId, t0=null;
  anchorTweening=true;
  function stepA(t){
    if(id!==anchorTweenId)return;              /* superado por outro tween / cancelado */
    if(t0===null)t0=t;
    var p=Math.min((t-t0)/dur,1);
    scrollTo(0,start+dist*anchorEase(p));
    if(p<1)requestAnimationFrame(stepA);
    else anchorTweening=false;
  }
  requestAnimationFrame(stepA);
}
document.addEventListener('click',function(e){
  var a=e.target.closest?e.target.closest('a[href^="#"]'):null;
  if(!a)return;
  var id=a.getAttribute('href');
  if(!id||id.length<2)return;                  /* href="#" → deixa passar */
  var target=document.querySelector(id);
  if(!target)return;
  e.preventDefault();
  if(reduce){target.scrollIntoView();return;}   /* reduced-motion → nativo */
  tweenTo(target);
});
/* gesto do usuário cancela o tween em andamento (respeita a intenção) */
['wheel','touchstart'].forEach(function(ev){
  addEventListener(ev,function(){if(anchorTweening){anchorTweenId++;anchorTweening=false;}},{passive:true});
});

/* ── convite flutuante ao WhatsApp · surge ao chegar na Dobra 1 ──
   Não compete com o pré-Hero minimalista: só aparece após rolar,
   recolhe ao voltar ao topo e some rápido ao ser dispensado.       */
var note=document.getElementById('noteCard');
if(note){
  var noteClose=document.getElementById('noteClose');
  var launcher=document.getElementById('noteLauncher');
  var noteWhats=document.getElementById('noteWhats');
  var dismissed=false, introDone=false, openingGrace=true;
  try{dismissed=sessionStorage.getItem('mp-note-dismissed')==='1';}catch(e){}
  if(launcher)launcher.hidden=false;   /* passa a existir no fluxo (fica oculto por CSS até .is-shown) */
  /* carência de abertura: o cartão não surge durante o reveal do pré-Hero
     (não compete com as transições de entrada). Solta após ~1.2s.        */
  setTimeout(function(){openingGrace=false;updateNote();},1200);

  /* Após o pré-Hero, mostra o card OU o lançador — nunca os dois. Antes
     disso (abertura cinematográfica), ambos ficam recolhidos.          */
  function updateNote(){
    var past=!openingGrace && scrollY>innerHeight*0.55;
    if(dismissed){
      note.classList.remove('is-shown');
      if(launcher){
        launcher.classList.toggle('is-shown',past);
        launcher.setAttribute('aria-expanded','false');
        if(past&&!introDone){                 /* anel único na 1ª aparição */
          introDone=true;launcher.classList.add('note-launcher--intro');
          setTimeout(function(){launcher.classList.remove('note-launcher--intro');},1000);
        }
      }
    }else{
      if(launcher)launcher.classList.remove('is-shown');
      note.classList.toggle('is-shown',past);
    }
  }

  if(noteClose)noteClose.addEventListener('click',function(){
    dismissed=true;
    note.classList.remove('is-shown');note.classList.add('is-dismissed');
    try{sessionStorage.setItem('mp-note-dismissed','1');}catch(e){}
    updateNote();
    if(launcher)launcher.focus();          /* foco segue para o lançador */
  });

  if(launcher)launcher.addEventListener('click',function(){
    dismissed=false;
    launcher.classList.remove('is-shown');launcher.setAttribute('aria-expanded','true');
    note.classList.remove('is-dismissed');
    try{sessionStorage.removeItem('mp-note-dismissed');}catch(e){}
    updateNote();
    if(noteWhats)noteWhats.focus();         /* foco entra no card reaberto */
  });

  addEventListener('scroll',updateNote,{passive:true});
  updateNote();
}

/* ── Dobra 5 · coverflow do método (exceção 3D sancionada) ────
   Componente interativo dirigido pelo usuário. NÃO sequestra a
   rolagem vertical: só o gesto horizontal (trackpad) avança.
   Setas · clique no card lateral · swipe/arrasto · teclado.       */
var flow=document.getElementById('flow');
if(flow){
  var flowCards=[].slice.call(flow.querySelectorAll('.flow__card'));
  var flowPrev=flow.querySelector('.flow__arrow--prev');
  var flowNext=flow.querySelector('.flow__arrow--next');
  var flowDots=[].slice.call(flow.querySelectorAll('.flow__dot'));
  var flowStatus=flow.querySelector('.flow__status');
  var flowCaption=document.getElementById('flowCaption');
  var N=flowCards.length;
  var active=0;                               /* card 01 centralizado */
  var reduceFlow=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function flowMax(){return innerWidth<620?1:2;}   /* vizinhos visíveis por lado */
  var MAXV=flowMax();

  /* deslocamento CIRCULAR (loop 360º): mapeia para [-N/2 .. N/2], então
     o card da ponta reaparece do outro lado ao girar.                  */
  function circ(i){var o=i-active;if(o>N/2)o-=N;else if(o<-N/2)o+=N;return o;}

  function flowRender(){
    var mob=innerWidth<=560;   /* mobile: 1 card por vez, sem coverflow 3D (impede vizinhos de vazarem) */
    for(var i=0;i<N;i++){
      var c=flowCards[i], o=circ(i), ao=Math.abs(o);
      /* deu a volta? teleporta (não desliza atravessando a cena) */
      if(c._o!==undefined && Math.abs(o-c._o)>MAXV+0.5){
        c.style.transition='none';
        (function(el){requestAnimationFrame(function(){el.style.transition='';});})(c);
      }
      c._o=o;
      if(ao>MAXV || (mob && ao>0)){
        c.style.opacity='0';c.style.pointerEvents='none';c.style.zIndex='0';
        c.style.transform='translateX('+(o<0?-1:1)*(mob?102:150)+'%) scale('+(mob?1:.6)+')';
        c.tabIndex=-1;c.classList.remove('is-active');
      }else{
        var x=o*57, rot=reduceFlow?0:(-o*33), tz=reduceFlow?0:(-ao*140), sc=1-ao*0.135;
        c.style.opacity=String(1-ao*0.19);
        c.style.pointerEvents='auto';c.style.zIndex=String(10-ao);
        c.style.transform='translateX('+x+'%) translateZ('+tz+'px) rotateY('+rot+'deg) scale('+sc+')';
        c.tabIndex=ao===0?0:-1;
        c.classList.toggle('is-active',ao===0);
      }
    }
    for(var d=0;d<flowDots.length;d++)flowDots[d].setAttribute('aria-current',d===active?'true':'false');
    /* legenda sincronizada · troca junto com o card central */
    if(flowCaption){
      var copy=flowCards[active].querySelector('.flow__copy');
      flowCaption.innerHTML=copy?copy.innerHTML:'';
      flowCaption.classList.remove('is-in');void flowCaption.offsetWidth;flowCaption.classList.add('is-in');
    }
    if(flowStatus)flowStatus.textContent=I18N.flowStatus(active+1,N,flowCards[active].getAttribute('data-step'));
  }
  function flowGo(i){var v=((i%N)+N)%N;if(v===active)return;active=v;flowRender();}   /* wrap = loop */

  if(flowPrev)flowPrev.addEventListener('click',function(){flowGo(active-1);});
  if(flowNext)flowNext.addEventListener('click',function(){flowGo(active+1);});
  flowDots.forEach(function(dot,i){dot.addEventListener('click',function(){flowGo(i);});});

  /* clique no card lateral traz ao centro (suprime clique após arrasto) */
  var flowMoved=false;
  flowCards.forEach(function(c,i){c.addEventListener('click',function(){
    if(flowMoved){flowMoved=false;return;}
    if(i!==active)flowGo(i);
  });});

  /* teclado quando o carrossel tem foco */
  flow.addEventListener('keydown',function(e){
    if(e.key==='ArrowLeft'){e.preventDefault();flowGo(active-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();flowGo(active+1);}
  });

  /* trackpad horizontal — só gesto lateral, nunca a rolagem vertical */
  var wheelLock=false;
  flow.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)+6){
      e.preventDefault();
      if(wheelLock)return;wheelLock=true;
      flowGo(active+(e.deltaX>0?1:-1));
      setTimeout(function(){wheelLock=false;},400);
    }
  },{passive:false});

  /* arrasto / swipe */
  var dragOn=false,dragStart=0,dragDx=0;
  flow.addEventListener('pointerdown',function(e){
    if(e.target.closest('.flow__arrow,.flow__dot'))return;
    dragOn=true;flowMoved=false;dragStart=e.clientX;dragDx=0;
  });
  addEventListener('pointermove',function(e){
    if(!dragOn)return;dragDx=e.clientX-dragStart;
    if(Math.abs(dragDx)>8)flowMoved=true;
  });
  addEventListener('pointerup',function(){
    if(!dragOn)return;dragOn=false;
    if(Math.abs(dragDx)>48)flowGo(active+(dragDx<0?1:-1));
  });

  var flowLastMob=innerWidth<=560;
  addEventListener('resize',function(){var m=flowMax();var mn=innerWidth<=560;if(m!==MAXV||mn!==flowLastMob){MAXV=m;flowLastMob=mn;flowRender();}},{passive:true});
  flowRender();
}

/* ── Contato · motion de revelação de fundo [Ambient em loop] ─────
   LOOP com crossfade na emenda (dissolve→redesenha, sem corte seco).
   Toca só enquanto a seção está à vista (pausa fora → perf/bateria).
   INTERATIVIDADE: a cena reage ao cursor (parallax de mouse sutil),
   além do parallax de rolagem (data-parallax). reduced-motion:
   estático — segura a casa construída, sem loop nem reação.        */
var finalVideo=document.getElementById('finalVideo');
if(finalVideo){
  var fvReduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(fvReduce){
    finalVideo.removeAttribute('loop');
    finalVideo.preload='auto';
    finalVideo.addEventListener('loadedmetadata',function(){try{finalVideo.currentTime=Math.max(0,(finalVideo.duration||0)-0.05);}catch(e){}});
    finalVideo.load();
  }else{
    /* crossfade na emenda: esmaece nos últimos/primeiros 0,7s */
    var FVFADE=0.7;
    finalVideo.addEventListener('timeupdate',function(){
      var d=finalVideo.duration;if(!d)return;
      var rem=d-finalVideo.currentTime,ct=finalVideo.currentTime,o=1;
      if(rem<FVFADE)o=Math.max(0,rem/FVFADE);
      else if(ct<FVFADE)o=Math.min(1,ct/FVFADE);
      finalVideo.style.opacity=o.toFixed(2);
    });
    /* toca enquanto visível · pausa fora */
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(es){es.forEach(function(e){
        if(e.isIntersecting){finalVideo.preload='auto';var p=finalVideo.play();if(p&&p.catch)p.catch(function(){});}
        else finalVideo.pause();
      });},{threshold:.25}).observe(finalVideo);
    }else{var pp=finalVideo.play&&finalVideo.play();if(pp&&pp.catch)pp.catch(function(){});}
    /* interatividade · a cena segue o cursor (parallax de mouse) */
    if(fine){
      var fvMedia=finalVideo.parentNode, fvSec=document.getElementById('contato');
      if(fvMedia&&fvSec){
        fvSec.addEventListener('pointermove',function(e){
          var r=fvSec.getBoundingClientRect();
          var nx=(e.clientX-r.left)/r.width-0.5, ny=(e.clientY-r.top)/r.height-0.5;
          fvMedia.style.transform='translate3d('+(nx*-16).toFixed(1)+'px,'+(ny*-11).toFixed(1)+'px,0)';
        },{passive:true});
        fvSec.addEventListener('pointerleave',function(){fvMedia.style.transform='translate3d(0,0,0)';});
      }
    }
  }
}

/* ── navegação persistente · MOV-03 (C3) ─────────────────────
   Surge ao sair do pré-Hero (a abertura cinematográfica fica
   intacta), recolhe na rolagem para baixo e reaparece na rolagem
   para cima. Orientação é Functional: em reduced-motion continua
   aparecendo — o deslize vira fade pela variante da Phase 14.      */
var sitenav=document.getElementById('siteNav');
if(sitenav){
  var navSentinel=document.getElementById('prehero');
  var navActive=false, navLastY=scrollY, TUCK_THRESHOLD=4;

  function setNavActive(on){
    if(on===navActive)return;
    navActive=on;
    sitenav.classList.toggle('is-active',on);
    if(!on)sitenav.classList.remove('is-tucked');   /* reset ao voltar ao topo */
  }
  /* ativa quando o pré-Hero já saiu pelo topo do viewport */
  if('IntersectionObserver' in window && navSentinel){
    new IntersectionObserver(function(es){
      var e=es[0];
      setNavActive(!e.isIntersecting && e.boundingClientRect.top<0);
    },{threshold:0}).observe(navSentinel);
  }
  /* hide-on-down / reveal-on-up — só quando ativa e com menu fechado */
  addEventListener('scroll',function(){
    var y=scrollY;
    if(navActive && !document.body.classList.contains('is-nav-open') && !anchorTweening){
      if(y>navLastY && y-navLastY>TUCK_THRESHOLD)sitenav.classList.add('is-tucked');
      else if(y<navLastY)sitenav.classList.remove('is-tucked');
    }
    navLastY=y;
  },{passive:true});

  /* ── indicador de seção ativa · scrollspy (MOV-03) ───────────
     Uma "trip line" a 45%/55% do viewport: a seção que a cruza fica
     ativa. O indicador desliza até o link por translateX+scaleX
     (zero layout). Só 3 das 12 dobras são alvo — nas demais o
     indicador permanece na última cruzada (comportamento padrão).  */
  var navLinks=[].slice.call(sitenav.querySelectorAll('.sitenav__link'));
  var navInd=sitenav.querySelector('.sitenav__ind');
  navLinks.forEach(function(l,i){l.style.setProperty('--i',i);});  /* índice p/ cascata mobile (06d) */

  var navMap=navLinks.map(function(l){
    var id=l.getAttribute('href')||'';
    var sec=(id.charAt(0)==='#'&&id.length>1)?document.querySelector(id):null;
    return{link:l,sec:sec};
  }).filter(function(m){return m.sec;});

  var navCurrent=null;
  function moveInd(link){
    if(!navInd)return;
    if(!link){navInd.style.opacity='0';return;}
    navInd.style.opacity='1';
    navInd.style.transform='translateX('+link.offsetLeft+'px) scaleX('+link.offsetWidth+')';
  }
  function setCurrent(link){
    if(link===navCurrent)return;navCurrent=link;
    navLinks.forEach(function(l){
      var on=l===link;
      l.classList.toggle('is-current',on);
      if(on)l.setAttribute('aria-current','true');else l.removeAttribute('aria-current');
    });
    moveInd(link);
  }
  if('IntersectionObserver' in window && navMap.length){
    var spy=new IntersectionObserver(function(es){es.forEach(function(e){
      if(!e.isIntersecting)return;
      var m=navMap.filter(function(x){return x.sec===e.target;})[0];
      if(m)setCurrent(m.link);
    });},{rootMargin:'-45% 0px -55% 0px',threshold:0});
    navMap.forEach(function(m){spy.observe(m.sec);});
  }
  /* offsets mudam ao redimensionar → recoloca o indicador no link ativo */
  addEventListener('resize',function(){if(navCurrent)moveInd(navCurrent);},{passive:true});

  /* ── menu mobile · burger + cascata + trap (MOV-03 / 06d) ─────
     Overlay full-screen (CSS @≤760px). Abre/fecha com scroll-lock,
     Esc e foco contido no header. A cascata usa --stagger-menu.
     Acessível por desenho: aria-expanded, foco devolvido ao burger,
     Tab preso enquanto aberto.                                     */
  var burger=document.getElementById('siteBurger');
  var navLinksBox=document.getElementById('siteNavLinks');
  if(burger&&navLinksBox){
    var menuOpen=false, burgerReturn=null;

    function focusablesIn(c){
      return [].slice.call(c.querySelectorAll('a[href],button:not([disabled])'))
        .filter(function(el){return el.offsetParent!==null;});   /* só visíveis */
    }
    function setMenu(open){
      if(open===menuOpen)return;
      menuOpen=open;
      burger.classList.toggle('is-open',open);
      navLinksBox.classList.toggle('is-open',open);
      document.body.classList.toggle('is-nav-open',open);
      burger.setAttribute('aria-expanded',open?'true':'false');
      burger.setAttribute('aria-label',open?I18N.menuClose:I18N.menuOpen);
      if(open){
        sitenav.classList.remove('is-tucked');        /* nunca recolher aberto */
        burgerReturn=document.activeElement;
        if(navLinks[0])navLinks[0].focus();
      }else if(burgerReturn&&burgerReturn.focus){
        burgerReturn.focus();burgerReturn=null;        /* devolve o foco ao gatilho */
      }
    }
    burger.addEventListener('click',function(){setMenu(!menuOpen);});
    navLinks.forEach(function(l){l.addEventListener('click',function(){setMenu(false);});});
    addEventListener('keydown',function(e){
      if(!menuOpen)return;
      if(e.key==='Escape'){setMenu(false);return;}
      if(e.key==='Tab'){                               /* Tab contido no header */
        var f=focusablesIn(sitenav);if(!f.length)return;
        var first=f[0],last=f[f.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    /* voltou ao desktop com o menu aberto → fecha */
    addEventListener('resize',function(){if(menuOpen&&innerWidth>760)setMenu(false);},{passive:true});
  }
}

/* ── esteira de dados · controle de pausa (WCAG 2.2.2) ───────
   Conteúdo em movimento por mais de 5s precisa de um mecanismo de
   pausa alcançável por teclado — hover sozinho não basta. O estado
   fica no container para o CSS reagir com animation-play-state.    */
var stripPause=document.getElementById('stripPause');
if(stripPause){
  var stripEl=stripPause.closest('.strip');
  stripPause.addEventListener('click',function(){
    var pausada=stripEl.classList.toggle('is-paused');
    stripPause.setAttribute('aria-pressed',pausada?'true':'false');
    stripPause.setAttribute('aria-label',pausada?I18N.stripResume:I18N.stripPause);
  });
}

/* ── assinatura de CTA · magnetismo + origem do radial (C4/MOV-02) ──
   Ponteiro fino, fora de reduced-motion. O botão segue o cursor até
   --move-touch; o radial-fill nasce do ponto de entrada e recolhe para
   o ponto de saída. Compõe com hover-lift e press-give via --mag-x/y.  */
if(fine && !reduce){
  var MAG=cssNum('--move-touch');   /* teto do ímã (4px) */
  function setBtnOrigin(b,e){
    var r=b.getBoundingClientRect();
    b.style.setProperty('--px',(e.clientX-r.left)+'px');
    b.style.setProperty('--py',(e.clientY-r.top)+'px');
  }
  [].slice.call(document.querySelectorAll('.btn')).forEach(function(b){
    b.addEventListener('pointerenter',function(e){setBtnOrigin(b,e);b.classList.add('is-magnetic');});
    b.addEventListener('pointermove',function(e){
      var r=b.getBoundingClientRect();
      var nx=(e.clientX-(r.left+r.width/2))/r.width;    /* -.5 … .5 */
      var ny=(e.clientY-(r.top+r.height/2))/r.height;
      b.style.setProperty('--mag-x',(nx*MAG*2).toFixed(1)+'px');
      b.style.setProperty('--mag-y',(ny*MAG*2).toFixed(1)+'px');
    });
    b.addEventListener('pointerleave',function(e){
      setBtnOrigin(b,e);
      b.style.setProperty('--mag-x','0px');b.style.setProperty('--mag-y','0px');
      b.classList.remove('is-magnetic');
    });
  });
}

/* ── Dobra 2 · cards com tilt 3D seguindo o mouse ────────────
   Só em ponteiro fino e sem reduced-motion. Cada card inclina
   como um plano; volta ao repouso ao sair.                     */
if(fine&&!reduce){
  [].slice.call(document.querySelectorAll('.about__card')).forEach(function(card){
    card.addEventListener('pointermove',function(e){
      var r=card.getBoundingClientRect();
      var nx=(e.clientX-r.left)/r.width*2-1;
      var ny=(e.clientY-r.top)/r.height*2-1;
      card.style.transform='rotateY('+(nx*6).toFixed(2)+'deg) rotateX('+(-ny*6).toFixed(2)+'deg) translateY(-8px)';
    });
    card.addEventListener('pointerleave',function(){card.style.transform='';});
  });
}

/* ROBUST-01: sinaliza que o script inicializou por completo. O failsafe
   inline no <head> reverte para no-js (revela tudo) se isto não aparecer,
   evitando que um erro de runtime deixe o conteúdo preso em opacity:0.    */
root.classList.add('js-ready');
})();
