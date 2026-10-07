// Подпись результата самопроверки: ФИО фиксируется один раз, ключ не даёт переименовать готовый скриншот.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const encoder=new TextEncoder();
const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const normalizeCode=(value:string)=>value.trim().toUpperCase().replace(/[^0-9A-Z]/g,'');
const hex=(buffer:ArrayBuffer)=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const base32=(bytes:Uint8Array,length:number)=>{let value=0,bits=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31]}}if(out.length<length)out+=alphabet[(value<<(5-bits))&31];return out.slice(0,length)};
async function hmac(key:string,message:string){const material=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',material,encoder.encode(message)))}
export const hashCode=async(code:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(normalizeCode(code))));
export const payloadOf=(p:{courseId:string;contentVersion:string;lectureId:string;hash:string;fullName:string;score:string;total:string;correct:string;wrong:string;timestamp:string})=>[p.courseId,p.contentVersion,p.lectureId,p.hash,p.fullName.trim().replace(/\s+/g,' '),p.score,p.total,p.correct,p.wrong,p.timestamp].join('|');
export const sign=async(key:string,p:{courseId:string;contentVersion:string;lectureId:string;hash:string;fullName:string;score:string;total:string;correct:string;wrong:string;timestamp:string})=>base32(await hmac(key,payloadOf(p)),24);
// Копия проверок движка для node --test и для scripts/validate-content.mjs.
export function checkCourseHasAccess(course:{id:string;contentVersion:string;accessCodesUrl?:string},file:unknown){
  assert.equal(typeof course.accessCodesUrl,'string','в курсе должен быть accessCodesUrl');
  const access=file as {schemaVersion:number;courseId:string;contentVersion:string;certificateKey:string;releaseHash?:string;lectures:Record<string,string[]>};
  assert.equal(access.schemaVersion,1);assert.equal(access.courseId,course.id);assert.equal(access.contentVersion,course.contentVersion);
  assert.ok(access.certificateKey.length>=32,'ключ подписи короче 32 символов');
  assert.match(String(access.releaseHash),/^[0-9a-f]{64}$/,'должен быть хеш мастер-кода для снятия доступа');
  for(const lecture of course.lectures)assert.ok(Array.isArray(access.lectures[lecture.id]),'нет списка кодов для '+lecture.id);
  for(const [id,list] of Object.entries(access.lectures))for(const hash of list)assert.match(hash,/^[0-9a-f]{64}$/,`неверный хеш кода в ${id}`);
}
// Срок жизни доступа: за компьютером может сесть другой человек.
export const UNLOCK_TTL_DAYS=7;
const DAY=86_400_000;
export function isFreshUnlock(unlock:{hash:string;at:number}|undefined,now=Date.now(),ttlDays=UNLOCK_TTL_DAYS){
  if(!unlock||typeof unlock.hash!=='string'||typeof unlock.at!=='number')return false;
  return now-unlock.at<ttlDays*DAY;
}
export function checkUnlockLifecycle(){
  const now=Date.now();
  assert.equal(isFreshUnlock({hash:'a',at:now}),true,'свежий доступ открыт');
  assert.equal(isFreshUnlock({hash:'a',at:now-UNLOCK_TTL_DAYS*DAY+1000}),true,'до истечения срока открыт');
  assert.equal(isFreshUnlock({hash:'a',at:now-UNLOCK_TTL_DAYS*DAY-1000}),false,'после истечения срока закрыт');
  assert.equal(isFreshUnlock({hash:'a',at:now-2*UNLOCK_TTL_DAYS*DAY}),false,'через год доступ закрыт');
  assert.equal(isFreshUnlock(undefined),false,'нет записи — закрыто');
  assert.equal(isFreshUnlock({hash:'a',at:0}),false,'нулевое время — закрыто');
  assert.equal(UNLOCK_TTL_DAYS,7,'срок доступа должен быть неделя');
}
// Мастер-код преподавателя: без него снять доступ на устройстве нельзя.
export async function checkReleaseCodeBound(access:{releaseHash?:string},valid:string,wrong:string){
  assert.match(String(access.releaseHash),/^[0-9a-f]{64}$/,'в access-codes.json должен быть хеш мастер-кода');
  assert.equal(await hashCode(valid),access.releaseHash,'мастер-код должен совпадать со своим хешем');
  assert.notEqual(await hashCode(wrong),access.releaseHash,'чужой код не должен проходить как мастер-код');
}
// Подпись покрывает ФИО: подмена имени ломает проверку, смена кода — тоже.
export async function checkSignatureBinding(access:{courseId:string;contentVersion:string;certificateKey:string},certificate:{lectureId:string;fullName:string;score:string;total:string;correct:string;wrong:string;timestamp:string;signature:string},code:string){
  const hash=await hashCode(code);const base={courseId:access.courseId,contentVersion:access.contentVersion,lectureId:certificate.lectureId,hash,fullName:certificate.fullName,score:certificate.score,total:certificate.total,correct:certificate.correct,wrong:certificate.wrong,timestamp:certificate.timestamp};
  const genuine=await sign(access.certificateKey,base);
  assert.equal(genuine,certificate.signature,'подпись не соответствует ФИО, коду и результату');
  assert.notEqual(await sign(access.certificateKey,{...base,fullName:'Петров Пётр Петрович'}),certificate.signature,'подпись должна ломаться при подмене ФИО');
  assert.notEqual(await sign(access.certificateKey,{...base,score:'9,00'}),certificate.signature,'подпись должна ломаться при подмене баллов');
  assert.notEqual(await sign(access.certificateKey,{...base,timestamp:new Date().toISOString()}),certificate.signature,'подпись должна ломаться при подмене времени');
}