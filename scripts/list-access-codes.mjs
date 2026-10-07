// Список кодов доступа для преподавателя. Коды секретные: файл не публикуется.
// Использование: node scripts/list-access-codes.mjs
import {readFile,writeFile} from 'node:fs/promises';
const course=JSON.parse(await readFile('public/course.json','utf8'));
const config=JSON.parse(await readFile('config/access-codes.json','utf8'));
const lines=[
  'Коды доступа к лекциям',
  'Курс: '+course.code+' — '+course.discipline,
  'Версия содержания: '+course.contentVersion,
  '',
  'Выдайте код нужной лекции студентам. Код вводится один раз, лекция',
  'остаётся открытой в этом браузере. Файл не публикуется и не должен',
  'попадать в репозиторий.',
  ''
];
let any=false;
for(const [i,l]of course.lectures.entries()){
  const codes=config.lectures[l.id];
  if(!Array.isArray(codes)||!codes.length)continue;
  any=true;
  lines.push(`Лекция ${i+1} — ${l.title}`);
  lines.push(`  код: ${codes.join(', ')}`);
  lines.push('');
}
if(!any)lines.push('Коды не заданы. Заполните config/access-codes.json и выполните npm run compile:access.');
lines.push('Мастер-код преподавателя (снимает доступ и ФИО на устройстве):');
lines.push('  releaseCode: '+(config.releaseCode||'не задан'));
lines.push('');
lines.push('Секретный ключ подписи (не раздавайте студентам):');
lines.push('  secret: '+config.secret);
lines.push('');
lines.push('Проверка подписи результата: npm run verify:certificate -- файл-отчёта.json');
await writeFile('config/access-codes.txt',lines.join('\n'));
console.log('Записан config/access-codes.txt: '+course.lectures.filter(l=>config.lectures[l.id]?.length).length+' лекций с кодами.');