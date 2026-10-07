import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateCourse} from '../vendor/validation/model.ts';
import {evaluate} from '../vendor/validation/scoring.ts';
import {checkCourseHasAccess,checkReleaseCodeBound,checkSignatureBinding,checkUnlockLifecycle,hashCode} from '../vendor/validation/access.ts';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const c=await read('public/course.json'), bank=await read('public/assessment.json'), map=await read('authoring/question-map.json'), original=await read('authoring/original-course.json'), migration=await read('authoring/migration-map.json');
validateCourse(c);assert.equal(c.demo,false);assert.equal(c.lectures.length,15);assert.equal(map.length,120);
assert.equal(c.id,bank.courseId);assert.equal(c.contentVersion,bank.contentVersion);
const ids=new Set(), add=id=>{assert.ok(id&&!ids.has(id),'Повтор ID '+id);ids.add(id)};
let cases=0,visuals=0,tasks=0;
for(const [i,l]of c.lectures.entries()){
  add(l.id);assert.equal(l.id,original.topics[i].id);assert.equal(l.sourceTitle,original.topics[i].sourceTitle);assert.equal(l.semester,original.topics[i].semester);assert.ok(l.slides.length>=80);
assert.deepEqual(l.slides.slice(0,2).map(s=>s.kind),['title','agenda']);
  assert.ok(!l.slides.some(s=>s.kind==='literature'||s.kind==='materials'),'библиография и материалы убраны из лекции');
  assert.ok(!l.slides.some(s=>/семестр/i.test(s.kicker||'')),'в подписи слайда не должно быть семестра');
  assert.equal(l.slides.at(-1).kind,'questions');assert.equal(l.slides.filter(s=>s.kind==='section').length,8);
  assert.equal(l.slides[1].kind,'agenda');assert.equal(l.slides.filter(s=>s.kind==='agenda').length,1);
  assert.ok(!l.slides.some(s=>/-plan-[ab]$/.test(s.id)||s.title.startsWith('Учебные вопросы:')),l.id+': дубли карты темы');
  assert.ok(c.topicArrow);assert.ok(c.literature.primary.length);assert.equal(c.materialsUrl,original.course.materialsUrl);
  const qs=map.filter(q=>q.lectureId===l.id);assert.deepEqual(qs.map(q=>q.title),original.topics[i].questions.map(q=>q.title));
  const old=migration.filter(m=>m.lectureId===l.id);assert.equal(new Set(old.map(m=>m.oldSlide)).size,85);
  for(const m of old)for(const id of m.targetSlideIds)assert.ok(l.slides.some(s=>s.id===id));
  for(const q of qs){
    const slides=q.slideIds.map(id=>l.slides.find(s=>s.id===id));assert.ok(slides.every(Boolean));
    assert.equal(slides[0].kind,'section');assert.equal(slides[0].title,q.title);
    assert.deepEqual(slides.slice(-4).map(s=>s.task?.type),['single','multiple','short','matching']);
    assert.equal(slides.filter(s=>s.kind==='test').length,4);assert.ok(slides.filter(s=>s.visual||s.rows).length>=2);assert.ok(slides.some(s=>s.notebook));assert.ok(slides.some(s=>s.kind==='example'));
    const first=l.slides.findIndex(s=>s.task?.id===q.testIds[0]);for(const id of q.explanationSlideIds)assert.ok(l.slides.findIndex(s=>s.id===id)<first);
  }
  for(const s of l.slides){
    add(s.id);if(s.visual){visuals++;assert.ok(s.visual.caption);if(s.visual.type==='process'){assert.ok(s.visual.items.length>=2&&s.visual.items.length<=4);assert.ok(s.visual.items.every(x=>x.title&&x.text));}}
    if(s.rows){assert.ok(s.rows.length<=4);assert.ok(s.rows.every(r=>r.length===s.columns.length));}
    if(!s.task)continue; tasks++;const t=s.task,k=bank.keys[t.id];add(t.id);assert.ok(k);assert.equal(k.type,t.type);
    if(t.options)assert.equal(new Set(t.options.map(x=>x.id)).size,t.options.length);
    let correct,incorrect,partial,empty;
    if(t.type==='single'||t.type==='multiple'){
      assert.equal(t.options.length,t.type==='single'?4:5);assert.equal(k.correct.length,t.type==='single'?1:t.choose);
      assert.ok(k.correct.every(id=>t.options.some(o=>o.id===id)));assert.equal(Object.keys(k.optionExplanations).length,t.options.length);
      correct=t.type==='single'?k.correct[0]:k.correct;incorrect=t.options.filter(o=>!k.correct.includes(o.id)).map(o=>o.id);partial=t.type==='multiple'?[k.correct[0]]:incorrect;empty=[];
    }else if(t.type==='short'){assert.ok(k.accepted?.length||k.numeric);correct=k.numeric?String(k.numeric.value):`  ${k.accepted[0].toUpperCase()}  `;incorrect='ЗАВЕДОМО НЕВЕРНЫЙ ОТВЕТ';partial=incorrect;empty='   ';}
    else {assert.equal(t.items.length,4);assert.equal(t.options.length,4);assert.equal(Object.keys(k.pairs).length,4);assert.equal(new Set(Object.values(k.pairs)).size,4);correct=k.pairs;empty={};incorrect=Object.fromEntries(t.items.map(it=>[it.id,t.options.find(o=>o.id!==k.pairs[it.id]).id]));partial={[t.items[0].id]:k.pairs[t.items[0].id]};}
    assert.equal(evaluate(t,k,correct).score,1);assert.equal(evaluate(t,k,incorrect).score,0);assert.equal(evaluate(t,k,empty).status,'unanswered');assert.equal(evaluate(t,k,partial).score,t.type==='matching'?.25:0);cases+=4;
  }
}
assert.equal(Object.keys(bank.keys).length,tasks);
// Доступ по коду и подпись результата.
let access=null;
try{access=JSON.parse(await readFile('public/access-codes.json','utf8'))}catch{}
// Сверка мастер-кода с его хешем возможна только при файле преподавателя:
// config/access-codes.json не публикуется, в CI его нет.
const teacherCodes=await read('config/access-codes.json').catch(()=>null);
if(access){checkCourseHasAccess(c,access);checkUnlockLifecycle();cases+=6;if(teacherCodes)await checkReleaseCodeBound(access,teacherCodes.releaseCode,'ITP-WRONG-9999');const firstLecture=c.lectures[0];const hash=await hashCode('ITP-TEST-0000-0000');const timestamp='2026-09-12T10:00:00.000Z';const certificate={courseId:c.id,contentVersion:c.contentVersion,lectureId:firstLecture.id,code:hash.slice(0,4).toUpperCase(),fullName:'Проверка Фамилия Тестович',score:'36,00',total:'32',correct:'31',wrong:'1',timestamp,signature:''};const {sign}=await import('../vendor/validation/access.ts');certificate.signature=await sign(access.certificateKey,{courseId:c.id,contentVersion:c.contentVersion,lectureId:firstLecture.id,hash,fullName:certificate.fullName,score:certificate.score,total:certificate.total,correct:certificate.correct,wrong:certificate.wrong,timestamp});await checkSignatureBinding(access,certificate,'ITP-TEST-0000-0000');cases+=4}
const numericTask={id:'zero-check',type:'short',prompt:'Число'}, numericKey={type:'short',numeric:{value:0,tolerance:0},explanation:'Проверка нуля'};
assert.equal(evaluate(numericTask,numericKey,'0').score,1);assert.equal(evaluate(numericTask,numericKey,'').status,'unanswered');cases+=2;
const result={status:'passed',lectures:c.lectures.length,questions:map.length,slides:c.lectures.reduce((n,l)=>n+l.slides.length,0),tasks,visuals,scoringCases:cases,accessCodes:access?Object.values(access.lectures).reduce((n,l)=>n+l.length,0):0,originalSlidesMapped:migration.length,contentVersion:c.contentVersion};
await writeFile('reports/content-check.json',JSON.stringify(result,null,2)+'\n');console.log(result);
