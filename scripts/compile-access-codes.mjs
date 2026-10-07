// Сборка файла доступа из файла преподавателя.
// Читает config/access-codes.json (не публикуется) и пишет public/access-codes.json:
// в сборку попадают только SHA-256 хеши кодов и ключ подписи результата.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
const course=JSON.parse(await readFile('public/course.json','utf8'));
const normalize=value=>String(value).trim().toUpperCase().replace(/[^0-9A-Z]/g,'');
const hash=code=>createHash('sha256').update(normalize(code),'utf8').digest('hex');
let source;
try{source=JSON.parse(await readFile('config/access-codes.json','utf8'))}catch{console.log('ACCESS: config/access-codes.json не найден, лекции открыты без кода.');process.exit(0)}
if(!source||typeof source!=='object'||!source.lectures)throw Error('Некорректный config/access-codes.json');
const secret=typeof source.secret==='string'&&source.secret.length>=32?source.secret:randomBytes(32).toString('hex');
if(typeof source.secret!=='string'||source.secret.length<32)console.warn('ACCESS: ключ подписи сгенерирован заново и не сохранён. Скопируйте его из файла public/access-codes.json в config/access-codes.json, иначе прошлые подписи перестанут проверяться.');
const lectures={};let total=0;const weak=[];
for(const lecture of course.lectures){
  const codes=Array.isArray(source.lectures[lecture.id])?source.lectures[lecture.id]:[];
  const list=[...new Set(codes.map(normalize).filter(Boolean))];
  for(const code of list){if(code.length<8)weak.push(`${lecture.id}: ${code}`)}
  lectures[lecture.id]=list.map(hash);total+=list.length;
}
if(weak.length)throw Error('Код короче 8 символов, его можно подобрать: '+weak.join(', '));
const releaseCode=normalize(source.releaseCode||'');
if(releaseCode.length<8)throw Error('Мастер-код (releaseCode) короче 8 символов или не задан.');
const file={schemaVersion:1,courseId:course.id,contentVersion:course.contentVersion,certificateKey:secret,releaseHash:hash(releaseCode),lectures};
await writeFile('public/access-codes.json',JSON.stringify(file,null,2)+'\n');
console.log(`ACCESS: ${total} кодов для ${Object.values(lectures).filter(list=>list.length).length} лекций из 15; мастер-код и все коды в сборке только как хеши.`);