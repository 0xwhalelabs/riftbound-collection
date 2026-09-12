export function photoUrl(path) {
 return '/api/t1-image?path=' + encodeURIComponent(path);
}

// Use native image loading so previews appear immediately and failed requests
// have a visible retry, without keeping unbounded blob URLs in memory.
export function photoPreview(path, alt, {compact=false, load}={}) {
 const box=document.createElement('div');box.className='photo-preview'+(compact?' compact':'');
 const image=document.createElement('img');image.alt=alt;image.decoding='async';
 const status=document.createElement('span');status.className='photo-status';status.textContent='사진 불러오는 중…';
 const retry=document.createElement('button');retry.type='button';retry.textContent='사진 다시 불러오기';retry.hidden=true;
 let objectUrl,disposed=false;
 const start=async()=>{
  retry.hidden=true;status.hidden=false;status.textContent='사진 불러오는 중…';image.hidden=false;
  try { if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=load?await load(path):null;if(disposed){if(objectUrl)URL.revokeObjectURL(objectUrl);return}image.src=objectUrl||photoUrl(path); }
  catch { failed(); }
 };
 const failed=()=>{image.hidden=true;status.textContent='사진을 불러오지 못했습니다.';retry.hidden=false};
 image.onload=()=>{status.hidden=true};image.onerror=failed;
 retry.onclick=e=>{e.stopPropagation();start()};
 box.append(image,status,retry);start();
 box.release=()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 return box;
}
