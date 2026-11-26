(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const state={db:null,control:null,polls:[],meetings:[],votes:[],voteUnsub:null,voteError:false,authenticated:false};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseDate=value=>{if(!value)return null;const d=value.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?null:d;};
  const fmtDate=value=>{const d=parseDate(value);return d?d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'Дата уточняется';};
  const fmtTime=value=>{const d=parseDate(value);return d?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'--:--';};
  function updateClock(){const d=new Date();$('#liveClock').textContent=d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function setConnection(ok,msg){$('#connectionDot').classList.toggle('online',!!ok);$('#connectionText').textContent=msg;}
  function activePoll(){const c=state.control||{};return state.polls.find(p=>p.id===c.pollId)||state.polls.find(p=>p.status==='open')||null;}
  function upcomingMeeting(){const now=new Date(),c=state.control||{};if(c.meetingId)return state.meetings.find(m=>m.id===c.meetingId)||null;return state.meetings.filter(m=>m.status!=='cancelled'&&parseDate(m.date+'T'+(m.time||'23:59'))>=now).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0]||null;}
  function syncVotes(poll){
    if(state.voteUnsub){state.voteUnsub();state.voteUnsub=null;}
    state.votes=[];state.voteError=false;
    if(!poll||!state.db)return;if(!state.authenticated){state.voteError=true;return;}
    state.voteUnsub=state.db.collection('polls').doc(poll.id).collection('votes').onSnapshot(snap=>{state.votes=snap.docs.map(d=>d.data());state.voteError=false;render();},err=>{console.warn('Live vote read:',err);state.voteError=true;render();});
  }
  function pollMarkup(poll){
    if(!poll)return '<div class="empty-live"><span>◉</span><h2>Пока нет активного голосования</h2><p>Когда пульт выберет голосование, оно появится здесь.</p></div>';
    const votes=state.votes, total=votes.length;
    const counts=(poll.options||[]).map(o=>({label:o.label,count:votes.filter(v=>(v.selectedOptionIds||[]).includes(o.id)).length}));
    return '<article class="poll-display"><div class="section-kicker">ГОЛОСОВАНИЕ · '+(poll.status==='open'?'ИДЁТ СЕЙЧАС':'ЗАВЕРШЕНО')+'</div><h2>'+esc(poll.title)+'</h2>'+(poll.description?'<p class="poll-description">'+esc(poll.description)+'</p>':'')+'<div class="vote-total"><b>'+ (state.voteError?'—':total) +'</b><span>участников проголосовали</span></div><div class="result-list">'+(state.voteError?'<p class="privacy-note">Для просмотра результатов откройте Live-экран в том же браузере, где выполнен вход в CRM.</p>':counts.map((o,i)=>{const pct=total?Math.round(o.count/total*100):0;return '<div class="result-item" style="--delay:'+i*90+'ms"><div class="result-label"><span>'+esc(o.label)+'</span><b>'+o.count+' · '+pct+'%</b></div><div class="result-track"><i style="width:'+pct+'%"></i></div></div>';}).join(''))+'</div></article>';
  }
  function meetingMarkup(meeting){
    if(!meeting){
      const selected=!!(state.control||{}).meetingId;
      return '<div class="empty-live"><span>◷</span><h2>'+(selected?'Выбранное собрание не загружено':'Нет выбранного собрания')+'</h2><p>'+(selected?'Проверьте, что собрание опубликовано и доступно для показа.':'Выберите событие на пульте управления.')+'</p></div>';
    }
    const date=meeting.date?new Date(meeting.date+'T'+(meeting.time||'00:00')):null;
    return '<article class="meeting-display"><div class="section-kicker">СОБРАНИЕ СОВЕТА</div><div class="meeting-date">'+esc(fmtDate(date))+' <span>'+esc(meeting.time||'Время не указано')+'</span></div><h2>'+esc(meeting.title||'Собрание Совета')+'</h2><p class="meeting-location">'+esc(meeting.location||'Место проведения уточняется')+'</p>'+(meeting.agenda?'<div class="agenda"><span>ПОВЕСТКА</span><p>'+esc(meeting.agenda)+'</p></div>':'')+'</article>';
  }
  function render(){
    const c=state.control||{},root=$('#liveScreen');
    root.dataset.animation=c.animation||'smooth';
    if(!c.enabled){$('#liveStage').innerHTML='<div class="standby"><img src="assets/emblem.png" alt=""><p class="eyebrow">СОВЕТ ОБУЧАЮЩИХСЯ</p><h1>Вместе к большему.</h1><p>Трансляция пока не запущена</p><span class="standby-pulse"></span></div>';$('#liveFooterMessage').textContent='ОЖИДАНИЕ ТРАНСЛЯЦИИ';return;}
    const title=esc(c.title||'Совет обучающихся'),subtitle=c.subtitle?'<p class="screen-subtitle">'+esc(c.subtitle)+'</p>':'';
    const mode=c.mode||'overview';let content='';
    if(mode==='poll'){content=pollMarkup(activePoll());}
    else if(mode==='meeting'){content=meetingMarkup(upcomingMeeting());}
    else if(mode==='message'){content='<article class="message-display"><div class="section-kicker">ОБЪЯВЛЕНИЕ</div><h2>'+title+'</h2><p>'+esc(c.subtitle||'Вместе к большему.')+'</p></article>';}
    else {
      const poll=activePoll(),meeting=upcomingMeeting();
      content='<div class="overview-display"><div class="overview-heading"><p class="section-kicker">ПРЯМОЙ ЭФИР · СОВЕТ ОБУЧАЮЩИХСЯ</p><h1>'+title+'</h1>'+subtitle+'</div><div class="overview-columns"><section class="overview-card">'+meetingMarkup(meeting)+'</section><section class="overview-card">'+pollMarkup(poll)+'</section></div></div>';
    }
    $('#liveStage').innerHTML=content;
    $('#liveFooterMessage').textContent=mode==='poll'?'ГОЛОСОВАНИЕ В РЕАЛЬНОМ ВРЕМЕНИ':mode==='meeting'?'СОБРАНИЕ СОВЕТА':mode==='message'?'ОБЪЯВЛЕНИЕ СОВЕТА':'LIVE · СИНХРОНИЗАЦИЯ';
    $('#liveClock').hidden=c.showClock===false;
    document.body.classList.toggle('hide-stats',c.showStats===false);
  }
  function start(){
    if(!window.firebase||!window.SOVET_FIREBASE_CONFIG){setConnection(false,'Firebase недоступен');return;}
    if(!firebase.apps.length)firebase.initializeApp(window.SOVET_FIREBASE_CONFIG);
    state.db=firebase.firestore();
    firebase.auth().onAuthStateChanged(user=>{state.authenticated=!!user;if(user){setConnection(true,'Синхронизация активна');syncVotes(activePoll());}else{state.votes=[];state.voteError=true;setConnection(true,'Войдите в CRM для результатов');render();}});
    state.db.collection('liveControl').doc('current').onSnapshot(s=>{state.control=s.exists?s.data():null;const poll=activePoll();syncVotes(poll);setConnection(true,'Синхронизация активна');render();},e=>{console.error(e);setConnection(false,'Нет доступа к Live-настройкам');});
    state.db.collection('polls').where('published','==',true).limit(100).onSnapshot(s=>{state.polls=s.docs.map(d=>({id:d.id,...d.data()}));syncVotes(activePoll());render();},e=>console.warn('Polls:',e));
    state.db.collection('meetings').where('published','==',true).limit(100).onSnapshot(s=>{state.meetings=s.docs.map(d=>({...d.data(),id:d.id}));render();},e=>{console.error('Live meetings:',e);setConnection(false,'Не удалось загрузить собрания');});
  }
  $('#fullscreenButton').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});
  updateClock();setInterval(updateClock,1000);start();
})();