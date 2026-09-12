import {firebaseConfig} from './firebase-config.js';
import {photoPreview} from './photos.js';
import {ADMIN_UID,ADMIN_EMAIL} from './admin-config.js';
import {categoryOf,recordTitle} from './catalog.js';
const $=s=>document.querySelector(s),message=t=>$('#admin-message').textContent=t;
const [appSDK,authSDK,dbSDK,storageSDK]=await Promise.all(['app','auth','firestore','storage'].map(n=>import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${n}.js`)));
const app=appSDK.initializeApp(firebaseConfig,'archive-admin'),auth=authSDK.getAuth(app),db=dbSDK.getFirestore(app),storage=storageSDK.getStorage(app);
await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
let records=[],unsubscribe,deleteTarget=null,working=false,revision=0;
function releasePhotos(){document.querySelectorAll('.photo-preview').forEach(p=>p.release?.())}
async function loadPhoto(path){
 const token=await auth.currentUser.getIdToken();const response=await fetch('/api/t1-image?path='+encodeURIComponent(path),{headers:{Authorization:'Firebase '+token}});
 if(!response.ok)throw Error('Photo unavailable');return URL.createObjectURL(await response.blob());
}
function render(){
 revision++;releasePhotos();const area=$('#admin-records');area.replaceChildren();
 const pending=records.filter(r=>r.status==='pending').length;$('#counts').textContent=`승인 대기 ${pending}건 · 승인됨 ${records.length-pending}건`;
 const shown=records.filter(r=>($('#filter').value==='all'||r.status===$('#filter').value)&&($('#category-filter').value==='all'||categoryOf(r)===$('#category-filter').value)).sort((a,b)=>(b.createdAt?.seconds??0)-(a.createdAt?.seconds??0));
 if(!shown.length){const p=document.createElement('p');p.textContent='해당 제보가 없습니다.';area.append(p)}
 for(const r of shown){
  const card=document.createElement('article');card.className='admin-card';const h=document.createElement('h3');h.textContent=recordTitle(r);
  const badge=document.createElement('p');badge.className='admin-status';badge.textContent=r.status==='pending'?'승인 대기':'승인됨';card.append(h,badge);
  for(const path of r.photoPaths??[])card.append(photoPreview(path,h.textContent+' 제보 사진',{load:loadPhoto}));
  const note=document.createElement('p');note.textContent='제보: '+(r.nickname||'익명')+(r.note?' · '+r.note:'');card.append(note);
  if(!r.photoPaths?.length){const p=document.createElement('p');p.textContent='첨부 사진 없음';card.append(p)}
  if(/^https?:\/\//.test(r.source||'')){const a=document.createElement('a');a.href=r.source;a.target='_blank';a.rel='noopener noreferrer';a.textContent='출처 확인 ↗';card.append(a)}
  const actions=document.createElement('div');actions.className='admin-actions';
  if(r.status==='pending'){const b=document.createElement('button');b.textContent='승인';b.className='primary';b.disabled=working;b.onclick=()=>approve(r);actions.append(b)}
  const remove=document.createElement('button');remove.textContent='삭제';remove.disabled=working;remove.onclick=()=>{deleteTarget=r;$('#delete-target').textContent=h.textContent;$('#delete-dialog').showModal()};actions.append(remove);card.append(actions);area.append(card);
 }
}
async function action(fn,success){if(working)return;working=true;render();message('처리 중…');try{await fn();message(success)}catch{message('처리하지 못했습니다. 연결을 확인하고 다시 시도해주세요.')}finally{working=false;render()}}
function approve(r){return action(()=>dbSDK.updateDoc(dbSDK.doc(db,'t1Reports',r.id),{status:'approved'}),'승인했습니다. 아카이브에 공개됩니다.')}
$('#delete-cancel').onclick=()=>$('#delete-dialog').close();
$('#delete-confirm').onclick=()=>{const r=deleteTarget;$('#delete-dialog').close();if(!r)return;action(async()=>{
 // Keep the slot reserved until every stored image has been removed.
 for(const path of r.photoPaths??[]){try{await storageSDK.deleteObject(storageSDK.ref(storage,path))}catch(e){if(e.code!=='storage/object-not-found')throw e}}
 await dbSDK.deleteDoc(dbSDK.doc(db,'t1Reports',r.id));
},'제보와 사진을 삭제했습니다. 해당 번호는 다시 접수할 수 있습니다.')};
$('#filter').onchange=render;
$('#category-filter').onchange=render;
$('#login').onsubmit=async e=>{e.preventDefault();const button=$('#login button');button.disabled=true;message('로그인 확인 중…');try{
 const result=await authSDK.signInWithEmailAndPassword(auth,ADMIN_EMAIL,$('#password').value);$('#password').value='';
 if(result.user.uid!==ADMIN_UID){await authSDK.signOut(auth);throw Error('Unauthorized')}
 message('');
 }catch(error){message(error.code==='auth/too-many-requests'?'로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.':'비밀번호가 올바르지 않거나 로그인할 수 없습니다.')}finally{button.disabled=false}};
$('#logout').onclick=()=>authSDK.signOut(auth);
authSDK.onAuthStateChanged(auth,user=>{
 unsubscribe?.();unsubscribe=null;releasePhotos();records=[];$('#admin-records').replaceChildren();$('#delete-dialog').close();
 const allowed=user?.uid===ADMIN_UID;$('#login').hidden=allowed;$('#dashboard').hidden=!allowed;$('#logout').hidden=!allowed;
 if(allowed){unsubscribe=dbSDK.onSnapshot(dbSDK.collection(db,'t1Reports'),snap=>{records=snap.docs.map(d=>({...d.data(),id:d.id}));render()},()=>message('관리 권한을 확인할 수 없습니다. 다시 로그인해주세요.'))}
 else message('');
});
