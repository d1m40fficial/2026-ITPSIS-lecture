// Проверка результата самопроверки на стороне преподавателя.
// Использование: node scripts/verify-certificate.mjs <файл-сертификата.json> [код]
// Код нужен, если в сертификате указан только отпечаток: он хранится у преподавателя.
import {readFile} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
const normalize=value=>String(value).trim().toUpperCase().replace(/[^0-9A-Z]/g,'');
const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const toBase32=(bytes,length)=>{let value=0,bits=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31]}}if(out.length<length)out+=alphabet[(value<<(5-bits))&31];return out.slice(0,length)};
const [file,codeArgument]=process.argv.slice(2);
if(!file){console.error('Укажите файл сертификата: node scripts/verify-certificate.mjs certificate.json [код]');process.exit(1)}
const access=JSON.parse(await readFile('public/access-codes.json','utf8'));
const certificate=JSON.parse(await readFile(file,'utf8'));
const codes=JSON.parse(await readFile('config/access-codes.json','utf8'));
if(certificate.courseId!==access.courseId||certificate.contentVersion!==access.contentVersion){console.error('ПРОВАЛ: сертификат относится к другой версии курса.');process.exit(2)}
const secret=codes.secret||access.certificateKey;
if(!secret||secret.length<32){console.error('Нет ключа подписи. Задайте secret в config/access-codes.json.');process.exit(2)}
const candidates=[];
if(codeArgument)candidates.push(codeArgument);
for(const list of Object.values(codes.lectures||{}))for(const code of Array.isArray(list)?list:[])candidates.push(code);
const matched=candidates.map(normalize).filter(Boolean).map(code=>({code,hash:createHash('sha256').update(code,'utf8').digest('hex')}));
const hit=matched.find(entry=>entry.hash.slice(0,4).toUpperCase()===String(certificate.code||'').toUpperCase());
if(!hit){console.error(`ПРОВАЛ: отпечаток кода ${certificate.code} не найден в вашем списке кодов.`);process.exit(2)}
const payload=[certificate.courseId,certificate.contentVersion,certificate.lectureId,hit.hash,certificate.fullName,certificate.score,certificate.total,certificate.correct,certificate.wrong,certificate.timestamp].join('|');
const expected=toBase32(createHmac('sha256',secret).update(payload,'utf8').digest(),24);
if(expected!==certificate.signature){console.error(`ПРОВАЛ: подпись не совпадает. ФИО «${certificate.fullName}» изменено после подписания или код выдан другому студенту.`);process.exit(2)}
console.log(`ПОДПИСЬ ВЕРНА
Студент:   ${certificate.fullName}
Лекция:    ${certificate.lectureId}
Код:       ${certificate.code} (совпадает с выданным кодом)
Баллы:     ${certificate.score} из ${certificate.total}
Верно:     ${certificate.correct}, с ошибкой: ${certificate.wrong}
Подписано: ${certificate.timestamp}`);