import {firebaseConfig} from './firebase-config.js';
const $=s=>document.querySelector(s), players=[['Doran','도란','Ambessa · 암베사'],['Oner','오너','Xin Zhao · 신 짜오'],['Faker','페이커','Galio · 갈리오'],['Gumayusi','구마유시','Miss Fortune · 미스 포츈'],['Keria','케리아','Seraphine · 세라핀']];
let selected=2,page=0,records=[],ready=false,loaded=false,files=[],busy=false,api=null,activeSerial=1;
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
 $('#players').replaceChildren(...players.map((p,i)=>{const b=document.createElement('button');b.className=i===selected?'active':'';b.setAttribute('aria-pressed',i===selected);b.innerHTML=`<span class="num">0${i+1}</span><b>${p[0].toUpperCase()}</b><small>${p[1]}</small>`;b.onclick=()=>{selected=i;render()};return b}));
 $('#champion').textContent=players[selected][2]+' / KR';$('#player-title').innerHTML=players[selected][0].toUpperCase()+` <span>${players[selected][1]}</span>`;
 const unique=new Set(records.map(r=>r.player+'-'+r.serial)),known=new Set(records.filter(r=>r.player===players[selected][0]).map(r=>r.serial));
 $('#total').textContent=loaded?unique.size.toLocaleString():'—';$('#remaining').textContent=loaded?(10125-unique.size).toLocaleString():'—';$('#percent').textContent=loaded?(unique.size/10125*100).toFixed(2)+'%':'—';$('#found').textContent=`개봉 등록 ${loaded?known.size:'—'} / 2,025`;
 $('#ranges').replaceChildren(...Array.from({length:9},(_,i)=>{const b=document.createElement('button');b.textContent=`${i*225+1}–${(i+1)*225}`;b.className=i===page?'active':'';b.setAttribute('aria-pressed',i===page);b.onclick=()=>{page=i;render()};return b}));
 $('#grid').replaceChildren(...Array.from({length:225},(_,i)=>{const n=page*225+i+1,b=document.createElement('button');b.textContent=pad(n);b.className=known.has(n)?'known':'';b.setAttribute('aria-label',`${players[selected][1]} ${n}번 ${known.has(n)?'개봉 등록':'미확인'}`);b.onclick=()=>detail(n);return b}));$('#range-label').textContent=`${page*225+1}–${(page+1)*225} / 2,025`;
 const recent=$('#records');recent.replaceChildren();if(!records.length){const b=document.createElement('strong');b.textContent=loaded?'첫 번째 기록을 기다리고 있어요.':'아카이브 연결을 준비하고 있어요.';const p=document.createElement('p');p.textContent=loaded?'여러분의 한 장이 한국판 아카이브의 시작이 됩니다.':'지금 번호를 탐색하고 제보 양식을 살펴볼 수 있습니다. 실제 제보 접수는 연결 후 시작됩니다.';recent.append(b,p)}else records.slice().sort((a,b)=>(b.createdAt?.seconds??0)-(a.createdAt?.seconds??0)).slice(0,6).forEach(r=>{const b=document.createElement('button');b.className='record';b.textContent=`${r.player} · #${pad(r.serial)}   /   개봉 등록`;b.onclick=()=>{selected=players.findIndex(p=>p[0]===r.player);page=Math.floor((r.serial-1)/225);render();detail(r.serial)};recent.append(b)});
}
function detail(n){activeSerial=n;$('#detail-title').textContent=`${players[selected][0]} #${pad(n)}`;const area=$('#detail-body');area.replaceChildren();const record=records.find(r=>r.player===players[selected][0]&&r.serial===n);const p=document.createElement('p');p.textContent=record?'개봉 등록 · 한국판':'미확인 번호입니다. 아직 등록된 제보가 없으며, 미개봉을 보장하지는 않습니다.';area.append(p);if(record){if(record.nickname){const x=document.createElement('p');x.textContent='제보: '+record.nickname;area.append(x)}if(record.source&&/^https?:\/\//.test(record.source)){const a=document.createElement('a');a.href=record.source;a.textContent='공개 출처 보기 ↗';a.target='_blank';a.rel='noopener noreferrer';area.append(a)}for(const path of record.photoPaths??[]){api?.image(path).then(url=>{if(!$('#detail').open||activeSerial!==n)return;const im=document.createElement('img');im.src=url;im.alt=`${record.player} ${record.serial}번 증빙 사진`;area.append(im)}).catch(()=>{const t=document.createElement('p');t.textContent='사진을 불러오지 못했습니다.';area.append(t)})}}$('#detail-report').hidden=Boolean(record);$('#detail').showModal()}
function openReport(n){$('#detail').close();$('#report-player').value=players[selected][0];if(n)$('#serial').value=n;$('#form-status').textContent='';$('#report-dialog').showModal()}
$('.report').onclick=()=>openReport();document.querySelectorAll('.report').forEach(b=>b.onclick=()=>openReport());$('#detail-report').onclick=()=>openReport(activeSerial);document.querySelectorAll('.close').forEach(b=>b.onclick=()=>{if(!busy)b.closest('dialog').close()});$('#report-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
players.forEach(p=>{const o=document.createElement('option');o.value=p[0];o.textContent=p[0]+' · '+p[1];$('#report-player').append(o)});
$('#search').onsubmit=e=>{e.preventDefault();const n=Number($('#jump').value);if(!Number.isInteger(n)||n<1||n>2025)return;page=Math.floor((n-1)/225);render();detail(n)};
function showFiles(){const area=$('#previews');area.replaceChildren();files.forEach((f,i)=>{const box=document.createElement('div');box.className='preview';const img=document.createElement('img');img.src=f.url;img.alt=`첨부 사진 ${i+1}`;const b=document.createElement('button');b.type='button';b.textContent='×';b.setAttribute('aria-label',`사진 ${i+1} 제거`);b.onclick=()=>{if(busy)return;URL.revokeObjectURL(f.url);files.splice(i,1);showFiles()};box.append(img,b);area.append(box)})}
async function processFiles(list){if(busy)return;$('#form-status').textContent='';for(const f of list){if(files.length>=3){$('#form-status').textContent='사진은 최대 3장까지 첨부할 수 있습니다.';break}if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024){$('#form-status').textContent='10MB 이하의 JPG, PNG, WebP 사진을 선택해주세요. HEIC 사진은 JPG로 변환해주세요.';continue}try{const image=await createImageBitmap(f);const ratio=Math.min(1,1800/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob)throw Error();files.push({blob,url:URL.createObjectURL(blob)})}catch{$('#form-status').textContent='읽을 수 없는 이미지입니다. 다른 사진으로 다시 시도해주세요.'}}showFiles()}
$('#files').onchange=e=>{addFiles(e.target.files);e.target.value=''};$('#capture').onchange=e=>{addFiles(e.target.files);e.target.value=''};$('#gallery').onclick=()=>$('#files').click();$('#camera').onclick=()=>$('#capture').click();$('#drop').onclick=()=>$('#files').click();$('#drop').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#files').click()}};
for(const type of ['dragenter','dragover'])$('#drop').addEventListener(type,e=>{e.preventDefault();$('#drop').classList.add('drag')});$('#drop').ondragleave=()=>$('#drop').classList.remove('drag');$('#drop').ondrop=e=>{e.preventDefault();$('#drop').classList.remove('drag');addFiles(e.dataTransfer.files)};$('#report-dialog').addEventListener('paste',e=>{const fs=Array.from(e.clipboardData.items).filter(i=>i.kind==='file').map(i=>i.getAsFile());if(fs.length){e.preventDefault();addFiles(fs)}});
$('#report-form').onsubmit=async e=>{e.preventDefault();if(busy)return;await processing;if(busy)return;const status=$('#form-status');if(!ready){status.textContent='아직 제보 접수가 시작되지 않았습니다. Firebase 연결 후 업로드할 수 있습니다.';return}const serial=Number($('#serial').value),source=$('#source').value.trim();if(records.some(r=>r.player===$('#report-player').value&&r.serial===serial)){status.textContent='이미 등록된 번호입니다. 같은 선수의 번호는 한 번만 등록할 수 있습니다.';return}if(!Number.isInteger(serial)||serial<1||serial>2025){status.textContent='1–2025 사이의 정수를 입력해주세요.';return}if(!files.length&&!source){status.textContent='사진을 첨부하거나 공개 출처 링크를 입력해주세요.';return}if(source&&!/^https?:\/\//i.test(source)){status.textContent='http 또는 https로 시작하는 출처를 입력해주세요.';return}busy=true;$('.submit').disabled=true;status.textContent='사진과 제보를 안전하게 전송하고 있습니다…';try{await api.submit({player:$('#report-player').value,serial,source,nickname:$('#nickname').value.trim(),note:$('#note').value.trim(),kind:new FormData(e.target).get('kind')},files.map(f=>f.blob));e.target.reset();files.forEach(f=>URL.revokeObjectURL(f.url));files=[];showFiles();status.textContent='등록되었습니다. 사진과 번호가 바로 공개되고 통계에 반영됩니다.'}catch(error){status.textContent=error.code==='duplicate'?'이미 다른 제보자가 등록한 번호입니다. 같은 선수의 번호는 한 번만 등록할 수 있습니다.':'전송하지 못했습니다. 입력 내용은 유지됩니다. 연결 상태를 확인하고 다시 시도해주세요.'}finally{busy=false;$('.submit').disabled=false}};
render();
if(!firebaseConfig){$('#connection').textContent='미리보기 · 공동 데이터 저장 연결 전입니다. 실제 제보는 아직 접수되지 않습니다.'}else{try{
 const [appSDK,authSDK,dbSDK,storageSDK]=await Promise.all(['app','auth','firestore','storage'].map(n=>import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`)));
 const app=appSDK.initializeApp(firebaseConfig),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app),storage=storageSDK.getStorage(app);
 api={
  image:async path=>{const response=await fetch('/api/t1-image?path='+encodeURIComponent(path));if(!response.ok)throw Error('Image unavailable');return URL.createObjectURL(await response.blob())},
  submit:async(data,blobs)=>{
   await auth.authStateReady();
   const user=auth.currentUser??(await authSDK.signInAnonymously(auth)).user;
   const reportId='KR-'+data.player+'-'+data.serial;
   const ref=dbSDK.doc(db,'t1Reports',reportId);
   const duplicate=()=>Object.assign(new Error('Already registered'),{code:'duplicate'});
   if((await dbSDK.getDoc(ref)).exists())throw duplicate();
   const paths=[];
   try{
    for(let i=0;i<blobs.length;i++){
     const path='t1Evidence/'+user.uid+'/'+reportId+'/'+i+'.jpg';
     await storageSDK.uploadBytes(storageSDK.ref(storage,path),blobs[i],{contentType:'image/jpeg'});
     paths.push(path);
    }
    await dbSDK.setDoc(ref,{...data,edition:'KR',uid:user.uid,photoPaths:paths,status:'approved',createdAt:dbSDK.serverTimestamp()});
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


