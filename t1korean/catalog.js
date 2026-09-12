export const categories={
 card:{label:'시그니처 카드',limit:2025,total:10125,prefix:'KR-'},
 box:{label:'사인 박스',limit:5,total:20,prefix:'KR-BOX-'}
};
// Existing submissions predate categories and are signature cards.
export const categoryOf=record=>record.category==='box'?'box':'card';
export const recordTitle=record=>categoryOf(record)==='box'?'사인 박스 · '+record.player:'시그니처 카드 · '+record.player+' #'+String(record.serial).padStart(4,'0');
