import {categories,categoryOf,recordTitle} from './catalog.js';
import {photoPreview} from './photos.js';
import {firebaseConfig} from './firebase-config.js';
const $=s=>document.querySelector(s), players=[['Doran','도란','Ambessa · 암베사'],['Oner','오너','Xin Zhao · 신 짜오'],['Faker','페이커','Galio · 갈리오'],['Gumayusi','구마유시','Miss Fortune · 미스 포츈'],['Keria','케리아','Seraphine · 세라핀']];
let selected=2,page=0,records=[],ready=false,loaded=false,files=[],busy=false,api=null,activeSerial=1,knownOnly=false,category='card';
const pad=n=>String(n).padStart(4,'0');
let processing=Promise.resolve();
function addFiles(list){
 const selectedFiles=Array.from(list);
 processing=processing.then(async()=>{
  if(busy)return;
  $('.submit').disabled=true;
  try{await processFiles(selectedFiles)}finally{if(!busy)$('.submit').disabled=false}
 });
 return processing;
}
function render(){
 if(category==='box'&&players[selected][0]==='Gumayusi')selected=2;
 const box=category==='box',catalog=categories[category],visible=records.filter(r=>categoryOf(r)===category),mine=visible.filter(r=>r.player===players[selected][0]);
 $('#category-card').setAttribute('aria-pressed',String(!box));$('#category-box').setAttribute('aria-pressed',String(box));
 $('#supply-label').textContent='한국판 '+catalog.label;$('#supply-total').textContent=catalog.total.toLocaleString();
 $('#registered-label').textContent=box?'확인된 사인 박스':'개봉 등록';$('#remaining-label').textContent=box?'미확인 박스':'미확인 번호';
 $('#registry-hint').textContent=box?'사진을 누르면 승인된 박스 제보를 볼 수 있어요.':'번호를 누르면 기록을 보거나 제보할 수 있어요.';$('.grid-tools>div').hidden=box;$('#records').setAttribute('aria-label',box?'최근 승인된 사인 박스 사진':'최근 승인된 카드 사진');
 $('#registry-title').textContent=box?'선수 친필 사인 박스':'시리얼 탐색';$('#registry-limit').textContent=box?'4명 × 선수당 5개 · 총 20개':'선수별 0001–2025';$('#recent-title').textContent=box?'최근 사인 박스 기록':'최근 개봉 기록';
 $('#players').classList.toggle('box-players',box);
 $('#players').replaceChildren(...players.map((p,i)=>{if(box&&p[0]==='Gumayusi')return null;const b=document.createElement('button');b.className=i===selected?'active':'';b.setAttribute('aria-pressed',i===selected);b.innerHTML='<span class="num">0'+(i+1)+'</span><b>'+p[0].toUpperCase()+'</b><small>'+p[1]+'</small>';b.onclick=()=>{selected=i;render()};return b}).filter(Boolean));
 $('#champion').textContent=box?'친필 사인 박스 / KR':players[selected][2]+' / KR';$('#player-title').innerHTML=players[selected][0].toUpperCase()+' <span>'+players[selected][1]+'</span>';
 const count=box?visible.length:new Set(visible.map(r=>r.player+'-'+r.serial)).size,known=new Set(mine.map(r=>r.serial));
 $('#total').textContent=loaded?count.toLocaleString():'—';$('#remaining').textContent=loaded?Math.max(0,catalog.total-count).toLocaleString():'—';$('#percent').textContent=loaded?(count/catalog.total*100).toFixed(2)+'%':'—';$('#found').textContent='승인된 제보 '+(loaded?mine.length:'—')+' / '+catalog.limit.toLocaleString();
 $('#search').hidden=box;$('#grid').hidden=box;$('#box-grid').hidden=!box;$('#box-help').hidden=!box;$('#ranges').hidden=box||knownOnly;
 $('#known-only').setAttribute('aria-pressed',String(knownOnly));$('#known-only').textContent=knownOnly?'전체 보기':'제보된 것만 보기';
 if(box){
  const area=$('#box-grid');area.replaceChildren();
  mine.forEach(r=>{const card=recordCard(r);area.append(card)});
  if(!knownOnly){const empty=document.createElement('button');empty.className='box-contribute';empty.textContent='＋ 사인 박스 제보하기 · 미확인 '+Math.max(0,5-mine.length)+'개';empty.onclick=()=>openReport();area.append(empty)}
  if(knownOnly&&!mine.length){const p=document.createElement('p');p.className='registry-empty';p.textContent='이 선수의 승인된 사인 박스 제보가 아직 없습니다.';area.append(p)}
  $('#range-label').textContent='승인된 사인 박스 '+mine.length+' / 5개';
 }else{
  $('#ranges').replaceChildren(...Array.from({length:9},(_,i)=>{const b=document.createElement('button');b.textContent=(i*225+1)+'–'+((i+1)*225);b.className=i===page?'active':'';b.setAttribute('aria-pressed',i===page);b.onclick=()=>{page=i;render()};return b}));
  const numbers=knownOnly?[...known].sort((a,b)=>a-b):Array.from({length:225},(_,i)=>page*225+i+1);
  $('#grid').replaceChildren(...numbers.map(n=>{const b=document.createElement('button');b.textContent=pad(n);b.className=known.has(n)?'known':'';b.setAttribute('aria-label',players[selected][1]+' '+n+'번 '+(known.has(n)?'개봉 등록':'미확인'));b.onclick=()=>detail(n);return b}));
  $('#range-label').textContent=knownOnly?'승인된 제보 '+known.size+'건':(page*225+1)+'–'+((page+1)*225)+' / 2,025';
  if(knownOnly&&!numbers.length){const p=document.createElement('p');p.className='registry-empty';p.textContent='이 선수의 승인된 제보가 아직 없습니다.';$('#grid').append(p)}
 }
 renderRecent();
}
function recordCard(r){
 const card=document.createElement('article');card.className='record';
 const open=()=>{category=categoryOf(r);selected=players.findIndex(p=>p[0]===r.player);if(category==='card')page=Math.floor((r.serial-1)/225);render();detail(category==='box'?r.id:r.serial)};
 if(r.photoPaths?.length)card.append(photoPreview(r.photoPaths[0],recordTitle(r)+' 제보 사진',{compact:true}));
 else {const empty=document.createElement('div');empty.className='photo-placeholder';empty.textContent='출처 링크로 제보된 소장품';card.append(empty)}
 const b=document.createElement('button');b.className='record-open';b.textContent=recordTitle(r)+' ↗';b.onclick=open;const caption=document.createElement('small');caption.textContent=r.nickname||'익명 제보';card.append(b,caption);card.querySelector('img')?.addEventListener('click',open);return card;
}
function renderRecent(){
 const visible=records.filter(r=>categoryOf(r)===category),recent=$('#records');recent.replaceChildren();recent.classList.toggle('has-records',Boolean(visible.length));$('#recent-controls').hidden=!visible.length;
 if(!visible.length){const b=document.createElement('strong');b.textContent=loaded?'첫 번째 승인된 기록을 기다리고 있어요.':'아카이브 연결을 준비하고 있어요.';const p=document.createElement('p');p.textContent='제보는 관리자 승인 후 사진과 함께 공개됩니다.';recent.append(b,p);return}
 visible.slice().sort((a,b)=>(b.createdAt?.seconds??0)-(a.createdAt?.seconds??0)).slice(0,30).forEach(r=>recent.append(recordCard(r)));
}
function detail(n){
 activeSerial=n;$('#detail-title').textContent=category==='box'?'사인 박스 · '+players[selected][0]:players[selected][0]+' #'+pad(n);
 const area=$('#detail-body');area.replaceChildren();const record=records.find(r=>categoryOf(r)===category&&(category==='box'?r.id===n:r.player===players[selected][0]&&r.serial===n));
 const p=document.createElement('p');p.textContent=record?'승인된 개봉 기록 · 한국판':'아직 공개된 제보가 없습니다. 승인 대기 중이거나 미확인인 번호입니다.';area.append(p);
 if(record){
  $('#detail-title').textContent=recordTitle(record);
  for(const path of record.photoPaths??[])area.append(photoPreview(path,recordTitle(record)+' 제보 사진'));
  if(!record.photoPaths?.length){const empty=document.createElement('p');empty.textContent='첨부 사진 없이 출처 링크로 등록된 제보입니다.';area.append(empty)}
  if(record.nickname){const x=document.createElement('p');x.textContent='제보: '+record.nickname;area.append(x)}
  if(record.note){const x=document.createElement('p');x.textContent=record.note;area.append(x)}
  if(record.source&&/^https?:\/\//.test(record.source)){const a=document.createElement('a');a.href=record.source;a.textContent='공개 출처 보기 ↗';a.target='_blank';a.rel='noopener noreferrer';area.append(a)}
 }
 $('#detail-report').hidden=Boolean(record);$('#detail').showModal();
}
$('#category-card').onclick=()=>{category='card';render()};
$('#category-box').onclick=()=>{category='box';render()};
$('#known-only').onclick=()=>{knownOnly=!knownOnly;render()};
$('#recent-prev').onclick=()=>$('#records').scrollBy({left:-$('#records').clientWidth,behavior:'smooth'});
$('#recent-next').onclick=()=>$('#records').scrollBy({left:$('#records').clientWidth,behavior:'smooth'});

function openReport(n){$('#detail').close();$('#report-category').value=category;updateReportCategory();$('#report-player').value=players[selected][0];if(n&&category==='card')$('#serial').value=n;$('#form-status').textContent='';$('#report-dialog').showModal()}
$('.report').onclick=()=>openReport();document.querySelectorAll('.report').forEach(b=>b.onclick=()=>openReport());$('#detail-report').onclick=()=>openReport(activeSerial);document.querySelectorAll('.close').forEach(b=>b.onclick=()=>{if(!busy)b.closest('dialog').close()});$('#report-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
function updateReportCategory(){
 const box=$('#report-category').value==='box',previous=$('#report-player').value;
 $('#serial-label').hidden=box;$('#serial').required=!box;$('#serial').disabled=box;
 $('#report-player').replaceChildren(...players.filter(p=>!box||p[0]!=='Gumayusi').map(p=>{const o=document.createElement('option');o.value=p[0];o.textContent=p[0]+' · '+p[1];return o}));
 $('#report-player').value=box&&previous==='Gumayusi'?'Faker':previous;
 $('#box-report-help').hidden=!box;$('#source-help').textContent=box?'선택 · 관련 출처가 있으면 추가':'사진이 없을 때 필수';
 $('#owned-label').textContent=box?'제가 소장한 사인 박스예요':'직접 개봉했어요';$('#photo-help').textContent=box?'사진 필수 · 박스 겉면 전체와 선수 사인이 보이게 촬영':'JPG, PNG, WebP · 시리얼과 한국어 카드명이 보이게 촬영';
}
$('#report-category').onchange=updateReportCategory;
players.forEach(p=>{const o=document.createElement('option');o.value=p[0];o.textContent=p[0]+' · '+p[1];$('#report-player').append(o)});
$('#search').onsubmit=e=>{e.preventDefault();const n=Number($('#jump').value);if(!Number.isInteger(n)||n<1||n>2025)return;page=Math.floor((n-1)/225);render();detail(n)};
function showFiles(){const area=$('#previews');area.replaceChildren();files.forEach((f,i)=>{const box=document.createElement('div');box.className='preview';const img=document.createElement('img');img.src=f.url;img.alt=`첨부 사진 ${i+1}`;const b=document.createElement('button');b.type='button';b.textContent='×';b.setAttribute('aria-label',`사진 ${i+1} 제거`);b.onclick=()=>{if(busy)return;URL.revokeObjectURL(f.url);files.splice(i,1);showFiles()};box.append(img,b);area.append(box)})}
async function processFiles(list){if(busy)return;$('#form-status').textContent='';for(const f of list){if(files.length>=3){$('#form-status').textContent='사진은 최대 3장까지 첨부할 수 있습니다.';break}if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024){$('#form-status').textContent='10MB 이하의 JPG, PNG, WebP 사진을 선택해주세요. HEIC 사진은 JPG로 변환해주세요.';continue}try{const image=await createImageBitmap(f);const ratio=Math.min(1,1800/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob)throw Error();files.push({blob,url:URL.createObjectURL(blob)})}catch{$('#form-status').textContent='읽을 수 없는 이미지입니다. 다른 사진으로 다시 시도해주세요.'}}showFiles()}
$('#files').onchange=e=>{addFiles(e.target.files);e.target.value=''};$('#capture').onchange=e=>{addFiles(e.target.files);e.target.value=''};$('#gallery').onclick=()=>$('#files').click();$('#camera').onclick=()=>$('#capture').click();$('#drop').onclick=()=>$('#files').click();$('#drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#files').click()}};
for(const type of ['dragenter','dragover'])$('#drop').addEventListener(type,e=>{e.preventDefault();$('#drop').classList.add('drag')});$('#drop').ondragleave=()=>$('#drop').classList.remove('drag');$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('drag');addFiles(e.dataTransfer.files)};$('#report-dialog').addEventListener('paste',e=>{const fs=Array.from(e.clipboardData.items).filter(i=>i.kind==='file').map(i=>i.getAsFile());if(fs.length){e.preventDefault();addFiles(fs)}});
$('#report-form').onsubmit=async e=>{e.preventDefault();if(busy)return;await processing;if(busy)return;const status=$('#form-status');if(!ready){status.textContent='아직 제보 접수가 시작되지 않았습니다. Firebase 연결 후 업로드할 수 있습니다.';return}const reportCategory=$('#report-category').value,serial=Number($('#serial').value),source=$('#source').value.trim();if(reportCategory==='card'&&records.some(r=>categoryOf(r)==='card'&&r.player===$('#report-player').value&&r.serial===serial)){status.textContent='이미 등록된 번호입니다. 같은 선수의 번호는 한 번만 등록할 수 있습니다.';return}if(reportCategory==='card'&&(!Number.isInteger(serial)||serial<1||serial>2025)){status.textContent='1–2025 사이의 정수를 입력해주세요.';return}if(reportCategory==='box'&&!files.length){status.textContent='사인 박스는 선수 사인이 보이는 사진을 1장 이상 첨부해주세요.';return}if(!files.length&&!source){status.textContent='사진을 첨부하거나 공개 출처 링크를 입력해주세요.';return}if(source&&!/^https?:\/\//i.test(source)){status.textContent='http 또는 https로 시작하는 출처를 입력해주세요.';return}busy=true;$('.submit').disabled=true;status.textContent='사진과 제보를 안전하게 전송하고 있습니다…';try{await api.submit({category:reportCategory,player:$('#report-player').value,...(reportCategory==='box'?{}:{serial}),source,nickname:$('#nickname').value.trim(),note:$('#note').value.trim(),kind:new FormData(e.target).get('kind')},files.map(f=>f.blob));e.target.reset();$('#report-category').value=reportCategory;updateReportCategory();files.forEach(f=>URL.revokeObjectURL(f.url));files=[];showFiles();status.textContent='제보가 접수되었습니다. 관리자 승인 후 사진과 번호가 공개되고 통계에 반영됩니다.'}catch(error){status.textContent=error.code==='duplicate'?'이미 등록되었거나 승인 대기 중인 번호입니다. 같은 선수의 번호는 한 번만 접수할 수 있습니다.':'전송하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인하고 다시 시도해주세요.'}finally{busy=false;$('.submit').disabled=false}};
render();
if(!firebaseConfig){$('#connection').textContent='미리보기 · 공동 데이터 저장 연결 전입니다. 실제 제보는 아직 접수되지 않습니다.'}else{try{
 const [appSDK,authSDK,dbSDK,storageSDK]=await Promise.all(['app','auth','firestore','storage'].map(n=>import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`)));
 const app=appSDK.initializeApp(firebaseConfig),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app),storage=storageSDK.getStorage(app);
 api={
  submit:async(data,blobs)=>{
   await auth.authStateReady();
   const user=auth.currentUser??(await authSDK.signInAnonymously(auth)).user;
   const reportId=data.category==='box'?'KR-BOX-'+data.player+'-'+dbSDK.doc(dbSDK.collection(db,'t1Reports')).id:'KR-'+data.player+'-'+data.serial;
   const ref=dbSDK.doc(db,'t1Reports',reportId);
   const duplicate=()=>Object.assign(new Error('Already registered'),{code:'duplicate'});
   try { if((await dbSDK.getDoc(ref)).exists())throw duplicate(); } catch(error) { if(error.code==='permission-denied')throw duplicate();throw error; }
   const paths=[];
   try{
    for(let i=0;i<blobs.length;i++){
     const path='t1Evidence/'+user.uid+'/'+reportId+'/'+i+'.jpg';
     await storageSDK.uploadBytes(storageSDK.ref(storage,path),blobs[i],{contentType:'image/jpeg'});
     paths.push(path);
    }
    await dbSDK.setDoc(ref,{...data,edition:'KR',uid:user.uid,photoPaths:paths,status:'pending',createdAt:dbSDK.serverTimestamp()});
   }catch(error){
    // The rules allow a competing submitter to clean up their own unused upload.
    await Promise.allSettled(paths.map(path=>storageSDK.deleteObject(storageSDK.ref(storage,path))));
    const existing=await dbSDK.getDoc(ref).catch(()=>null);
    if(existing?.exists())throw duplicate();
    throw error;
   }
  }
 };
 dbSDK.onSnapshot(dbSDK.query(dbSDK.collection(db,'t1Reports'),dbSDK.where('status','==','approved')),s=>{records=s.docs.map(d=>({...d.data(),id:d.id}));loaded=true;ready=true;$('#connection').textContent='한국판 아카이브 · 등록된 제보가 실시간으로 반영됩니다.';render()},()=>{ready=false;$('#connection').textContent='기록을 불러오지 못했습니다. 잠시 후 새로고침해주세요.'});
}catch{$('#connection').textContent='저장소 연결에 실패했습니다. 설정과 네트워크 상태를 확인해주세요.'}}


