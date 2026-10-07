import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const course=JSON.parse(await readFile('public/course.json','utf8'));
const pack=JSON.parse(await readFile('authoring/teacher-notes.json','utf8'));
assert.equal(pack.schemaVersion,1);assert.equal(pack.courseId,course.id);assert.equal(pack.contentVersion,course.contentVersion);
// Заметки — канонические данные и хранят записи для слайдов, которых больше нет в курсе.
// Требуем заметку для каждого существующего слайда; лишние записи не мешают.
const slides=course.lectures.flatMap(l=>l.slides);assert.ok(Object.keys(pack.notes).length>=slides.length,'в пакете заметок меньше записей, чем слайдов курса');
for(const s of slides)assert.ok(pack.notes[s.id],'нет заметки для '+s.id);
const fields=['script','preparation','notebook','questions','answer'];
for(const s of slides){const n=pack.notes[s.id];assert.ok(n,s.id);for(const f of fields)assert.ok(typeof n[f]==='string'&&n[f].trim(),`${s.id}: ${f}`);assert.ok(Number.isFinite(n.estimatedSeconds)&&n.estimatedSeconds>0);}
assert.ok(!JSON.stringify(pack).includes('ITPSIS_PRIVATE_SCRIPT_20260912'));
await mkdir('public/teacher-notes',{recursive:true});
for(const l of course.lectures){const part={schemaVersion:1,courseId:course.id,contentVersion:course.contentVersion,notesRevision:pack.notesRevision,notes:Object.fromEntries(l.slides.map(s=>[s.id,pack.notes[s.id]]))};await writeFile(`public/teacher-notes/${l.id}.json`,JSON.stringify(part)+'\n');}
await writeFile('reports/published-notes-check.json',JSON.stringify({contentVersion:course.contentVersion,notesRevision:pack.notesRevision,lectures:course.lectures.length,slides:slides.length,filledFields:slides.length*fields.length,missingFields:0,loading:'presenter only, one lecture per request',publication:'explicitly requested by user'},null,2)+'\n');
console.log(`Заметки: ${slides.length} слайдов, ${slides.length*fields.length} заполненных разделов, ${course.lectures.length} файлов.`);
