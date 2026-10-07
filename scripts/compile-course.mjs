import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {context} from '../authoring/itil-context.mjs';
import {workedResults} from '../authoring/worked-results.mjs';
const original=JSON.parse(await readFile('authoring/original-course.json','utf8'));
const sources=JSON.parse(await readFile('authoring/sources.json','utf8'));
const literature=JSON.parse(await readFile('authoring/literature.json','utf8'));
const version='2026-09-12-itil-4';
const accessCodes=await readFile('config/access-codes.json','utf8').then(JSON.parse).catch(()=>null);
const course={schemaVersion:1,contentVersion:version,id:'itpsis',code:'МДК.06.02',discipline:'Инженерно-техническая поддержка сопровождения информационных систем',year:'2026/2027',heroTitle:'Поддержка и сопровождение',heroAccent:'информационных систем',slogan:'Понимать услугу. Находить причины. Восстанавливать работу.',teacher:'Белоусов Д. И.',mascot:'brand/mascot/okfks-rhino-catalog.png',mascotAlt:'Носорог — специалист инженерно-технической поддержки',logo:'brand/synergy-logo.png',ornament:'brand/side-ornament.png',font:'fonts/raleway-cyrillic.woff2',materialsUrl:original.course.materialsUrl,...(accessCodes?{accessCodesUrl:'access-codes.json'}:{}),teacherNotesUrl:'teacher-notes/{lectureId}.json',teacherNotesPreviousVersions:['2026-09-12-itil-3','2026-09-12-itil-2'],topicArrow:'brand/topic-arrow.webp',literature,demo:false,semesters:[7,8],assessment:{mode:'autonomous',url:'assessment.json'},lectures:[]};
const bank={schemaVersion:1,courseId:course.id,contentVersion:version,mode:'autonomous-educational',notice:'Учебная самопроверка. Ключи технически доступны в файлах сайта. Это не защищённый экзамен.',keys:{}};
const registry=[],mapping=[],glossary=[],questionMap=[];
const rotate=(a,n)=>[...a.slice(n%a.length),...a.slice(0,n%a.length)];
const sentence=s=>s.replace(/[.!?]$/,'');
const formatJSON=x=>JSON.stringify(x,null,2)+'\n';
for(const [li,t] of original.topics.entries()){
  const c=context[li]; if(!c||c.questions.length!==t.questions.length)throw Error('Контекст не совпадает: '+t.id);
  const l={id:t.id,title:t.displayTitle,sourceTitle:t.sourceTitle,semester:t.semester,question:t.diagnostic,slides:[]};
  const add=(suffix,kind,title,fields={},source='Исходный курс · авторский учебный пример')=>{const s={id:`${t.id}-${suffix}`,kind,title,kicker:fields.kicker||t.displayTitle,...fields,source};l.slides.push(s);return s.id};
  const titleId=add('title','title',t.displayTitle,{body:t.objective,kicker:t.displayTitle});
  add('agenda','agenda','Вопросы темы',{kicker:'Карта темы'},'Учебные вопросы лекции');
  add('intro','theory','Место темы в сопровождении',{body:t.introduction});
  add('case','example','CampusHelp: условия учебной ситуации',{body:t.caseBrief,bullets:[`Результат: ${t.projectArtifact}.`,`Роль: ${t.caseRole}.`],kicker:'Учебные данные'});
  const facts=t.codeSample.split('\n');
  for(let i=0;i<facts.length;i+=4)add(`facts-${i/4+1}`,'example',t.codeLabel,{bullets:facts.slice(i,i+4),body:'Учебная запись исходного эпизода. Это данные для разбора, а не полная инструкция для рабочей системы. Примеры отдельных вопросов могут задавать другие условия.',kicker:'Учебные данные · исходная карточка'});
  add('readiness','theory','Исходные знания и результат',{body:'Нужны понятия пользователя, приложения, сервера и данных. HTTP — протокол обмена запросами; API — программный интерфейс; БД — база данных. Дальнейшие термины объясняются перед применением.',bullets:[t.objective,`Вопрос для входного обсуждения: ${t.diagnostic}`]});
  add('itil','theory','Как ITIL помогает в этой теме',{body:c.principle,kicker:c.practice},sources.references[c.reference].title);
  add('versions','theory','Версии и границы учебных примеров',{body:'ITIL — рекомендации по управлению цифровыми продуктами и услугами. В этой лекции практики сопровождения обозначены как ITIL 4. PeopleCert также развивает ITIL (Version 5). Учебный пример не заменяет регламент организации: уровни L1–L3, сроки, пороги и формы записей выбираются под конкретную услугу.',kicker:'ITIL 4 · контекст Version 5'},sources.references.versions.title);
  for(const [qi,q] of t.questions.entries()){
    const [term,definition,application]=c.questions[qi];
    const qid=`${t.id}-Q${String(qi+1).padStart(2,'0')}`;
    const prefix=`Q${String(qi+1).padStart(2,'0')}`;
    const kicker=`Вопрос ${qi+1} · ${q.title}`;
    const block=[];
    const qa=(suffix,kind,title,fields,source)=>{const id=add(`${prefix}-${suffix}`,kind,title,{...fields,kicker},source);block.push(id);return id};
    const section=qa('section','section',q.title,{body:`Цель: ${q.check}`});
    const theory=qa('theory','theory',q.title,{body:`${q.focus} ${q.rule}`});
    const concept=qa('term','theory',term,{body:`${definition} ${application}`,kicker},`${sources.references[c.reference].title} · учебное применение`);
    const example=qa('example','example','Разобранный пример',{body:q.example,bullets:[`Действие: ${q.decision}`,`Образец результата: ${workedResults[li][qi]}`,`Проверка: ${q.check}`]},'CampusHelp · авторский образец решения');
    const shortFacts={'s07-01-support-lifecycle-Q01':'Пользователь отправляет заявку; команда исправляет 503 и обновляет систему.','s07-01-support-lifecycle-Q02':'Работы: приём обращений, исправление очереди, обновление клиента, восстановление БД.','s07-03-sla-Q03':'126 из 180 пользователей не могут отправить обязательную заявку. Обхода нет.'};
    const flow=qa('flow','process','От условия к подтверждённому результату',{visual:{type:'process',items:[{title:'Исходные данные',text:shortFacts[qid]||q.example},{title:'Действие',text:q.decision},{title:'Проверка',text:q.check}],caption:`${q.title}: переход к выводу требует указанного свидетельства. Учебные данные.`}});
    const warning=qa('warning','warning','Где решение становится ошибочным',{body:`Ошибочный подход: ${q.pitfall}`,visual:{type:'decision',start:term,question:'Выполнено изученное правило?',yes:'Проверить результат',no:'Вернуться к условиям',caption:q.rule}});
    const note=qa('notebook','notebook','Запишите правило и границу применения',{notebook:`${term} — ${definition.charAt(0).toLowerCase()+definition.slice(1)} ${q.rule}`,body:`Признак корректного результата: ${q.check}`});
    // У задания есть достаточные объяснения до него; разные объекты в словаре не вводятся тестом.
    const terms=c.questions.map(x=>x[0]);
    const alternatives=[qi,(qi+1)%8,(qi+3)%8,(qi+5)%8];
    // Варианты определения — правдоподобные соседние понятия. Перед тестом они поясняются в сравнении.
    const compare=qa('distinctions','comparison','Различайте близкие объекты работы',{columns:['Понятие','Что означает'],rows:alternatives.map(i=>[terms[i],c.questions[i][1]])});
    const support=[theory,concept,example,flow,warning,note,compare];
    const taskIds=[];
    function task(n,type,prompt,props,key){const taskId=`${qid}-T0${n}`;taskIds.push(taskId);const options=props.options;const k={type,...key};if(options&&(type==='single'||type==='multiple'))k.optionExplanations=Object.fromEntries(options.map(o=>[o.id,k.correct.includes(o.id)?`Верно. ${key.explanation}`:(props.reasons?.[o.id]||`Это не отвечает условию данного вопроса. ${key.explanation}`)]));const {reasons:_,...publicProps}=props;qa(`test-${n}`,'test',`${q.title}: задание ${n}`,{task:{id:taskId,type,prompt,...publicProps}});bank.keys[taskId]=k;}
    const opts=[{id:'decision',text:q.decision},{id:'pitfall',text:q.pitfall},{id:'other-a',text:t.questions[(qi+3)%8].decision},{id:'other-b',text:t.questions[(qi+5)%8].decision}];
    task(1,'single',`Ситуация: ${q.example} Какое действие непосредственно отвечает задаче «${q.title}»?`,{options:rotate(opts,(qi+li)%4),reasons:{pitfall:`Ошибка: ${q.pitfall} Применяется правило: ${q.rule}`,'other-a':`Это решение другого вопроса: «${t.questions[(qi+3)%8].title}». В данном случае: ${q.decision}`,'other-b':`Это решение другого вопроса: «${t.questions[(qi+5)%8].title}». В данном случае: ${q.decision}`}},{correct:['decision'],explanation:`${q.decision} Основание: ${q.rule} Проверка: ${q.check}`});
    // Две пары «понятие — определение» верны, три имеют намеренно переставленные определения.
    const inds=[qi,(qi+1)%8,(qi+3)%8,(qi+5)%8];
    const multi=[{id:'a',text:`${terms[inds[0]]}: ${c.questions[inds[0]][1]}`},{id:'b',text:`${terms[inds[1]]}: ${c.questions[inds[1]][1]}`},{id:'c',text:`${terms[inds[0]]}: ${c.questions[inds[2]][1]}`},{id:'d',text:`${terms[inds[2]]}: ${c.questions[inds[3]][1]}`},{id:'e',text:`${terms[inds[3]]}: ${c.questions[inds[0]][1]}`}];
    task(2,'multiple','Выберите ровно две верные связи между понятием и его определением.',{choose:2,options:rotate(multi,(li+qi*2)%5),reasons:{c:`Подменено определение: ${terms[inds[0]]} — ${c.questions[inds[0]][1]}`,d:`Подменено определение: ${terms[inds[2]]} — ${c.questions[inds[2]][1]}`,e:`Подменено определение: ${terms[inds[3]]} — ${c.questions[inds[3]][1]}`}},{correct:['a','b'],explanation:`Различайте цели и объекты: ${terms[inds[0]]} — ${c.questions[inds[0]][1]} ${terms[inds[1]]} — ${c.questions[inds[1]][1]}`});
    task(3,'short',`Назовите термин из сравнения: ${sentence(definition)}. Введите название без пояснений.`,{}, {accepted:[term,...(term==='Service Desk'?['служба поддержки','сервис деск']:[])],explanation:`Ожидаемый термин: ${term}. ${definition} Регистр и повторяющиеся пробелы не учитываются.`});
    const items=alternatives.map(i=>({id:`i${i}`,text:terms[i]})), pairs=Object.fromEntries(alternatives.map(i=>[`i${i}`,`d${i}`]));
    task(4,'matching','Сопоставьте четыре понятия с их определениями. Каждому понятию соответствует одно определение.',{items,options:rotate(alternatives.map(i=>({id:`d${i}`,text:c.questions[i][1]})),1+(li+qi)%3)},{pairs,explanation:alternatives.map(i=>`${terms[i]} — ${c.questions[i][1]}`).join(' ')});
    questionMap.push({lectureId:l.id,questionId:qid,title:q.title,source:`src/data/courseData.ts → ${t.id} → questions[${qi}]`,programme:t.sourceContent,learningOutcome:q.check,explanationSlideIds:support,testIds:taskIds,slideIds:block,practice:c.practice,sourceId:c.reference});
    glossary.push({term,definition,mainLectureId:l.id,mainSlideId:concept,questionId:qid});
    // Исходные 7 слайдов вопроса и отдельное применение сохраняются через явное соответствие.
    const oldStarts=13+qi*7;
    const targets=[[section,theory],[theory,note],[theory,warning],[example,flow],[example,flow],[warning],[example,note]];
    for(let j=0;j<7;j++)mapping.push({lectureId:l.id,oldSlide:oldStarts+j,oldQuestion:q.title,targetSlideIds:targets[j],action:j===0?'объединена':'отредактирована',reason:j===0?'Разделитель восстановлен по обновлённому шаблону; объяснение сохранено.':'Исходное содержание сохранено, добавлены границы применения и контроль.'});
    mapping.push({lectureId:l.id,oldSlide:69+qi,targetSlideIds:[example,flow,note],action:'объединена',reason:'Повторяемое поручение заменено разобранным применением и готовым критерием.'});
  }
  add('summary-a','summary','Главные решения: вопросы 1–4',{bullets:t.questions.slice(0,4).map(q=>q.decision)});
  add('summary-b','summary','Главные решения: вопросы 5–8',{bullets:t.questions.slice(4).map(q=>q.decision)});
  add('final-case','example','Итоговое применение к работе поддержки',{body:`Результат работы: ${t.projectArtifact}.`,bullets:[t.questions[0].example,t.questions[3].decision,t.questions[7].check]});
  add('next','summary','Связь с дальнейшей работой',{body:`${t.nextStep.charAt(0).toUpperCase()+t.nextStep.slice(1)}.`,bullets:[`Для закрепления: ${original.selfStudy[t.semester]}`,t.labNumbers.length?`Связанная лабораторная: ${original.laboratories.find(x=>x.topicId===t.id)?.title}.`:'Примените результат в общем регламенте сопровождения.']});
  add('sources','summary','Источники и чтение',{bullets:[sources.references[c.reference].title,sources.references[c.reference].url,'Исходные темы дисциплины и основная литература сохранены в материалах курса.','Определения и CampusHelp — учебные формулировки и авторские примеры.'],kicker:'Проверка открытых источников: 12.09.2026'});
  add('audience-questions','questions','Вопросы от аудитории',{body:`Обсудим применение: ${t.projectArtifact}.`,bullets:[`Какие условия нужны для решения по вопросу «${t.questions[0].title}»?`,`Как проверить результат по вопросу «${t.questions[7].title}»?`]},'Обсуждение · вопросы и уточнения');
  const initialTargets=['title','agenda','sources','next','case','intro','readiness','case','agenda','case','readiness','readiness'];
  for(let i=1;i<=12;i++)mapping.push({lectureId:l.id,oldSlide:i,targetSlideIds:i===10?l.slides.filter(s=>s.id.includes('-facts-')).map(s=>s.id):[`${t.id}-${initialTargets[i-1]}`],action:'отредактирована',reason:i===10?'Исходная учебная карточка сохранена полностью и разделена для читаемости.':'Содержание включено в введение, маршрут или источники; повторяющиеся служебные страницы объединены.'});
  for(let i=77;i<=82;i++)mapping.push({lectureId:l.id,oldSlide:i,targetSlideIds:questionMap.filter(q=>q.lectureId===l.id).flatMap(q=>q.slideIds.slice(-4)),action:'заменена',reason:'Шесть общих заданий заменены четырьмя типами после каждого из восьми вопросов; изменена версия попыток.'});
  for(let i=83;i<=85;i++)mapping.push({lectureId:l.id,oldSlide:i,targetSlideIds:[`${t.id}-summary-a`,`${t.id}-summary-b`,`${t.id}-final-case`,`${t.id}-next`],action:'разделена',reason:'Итоги разбиты для читаемости; обсуждение включено в сопровождение.'});
  registry.push({id:l.id,title:l.title,semester:l.semester,sourceTitle:l.sourceTitle,hours:null,questions:t.questions.map(q=>q.title),slides:l.slides.length,tests:l.slides.filter(s=>s.task).length,visuals:l.slides.filter(s=>s.visual||s.rows).length,version,status:'содержание готово',teacher:'нужна сборка',pdf:'нужна сборка',checks:'запланировано',titleId});
  course.lectures.push(l);
}
for(const dir of ['public','authoring','reports'])await mkdir(dir,{recursive:true});
for(const [path,data]of [['public/course.json',course],['public/assessment.json',bank],['authoring/question-map.json',questionMap],['authoring/migration-map.json',mapping],['authoring/glossary.json',glossary],['reports/registry.json',registry]])await writeFile(path,formatJSON(data));
const concepts=new Map();for(const g of glossary){const key=g.term.toLowerCase();if(!concepts.has(key))concepts.set(key,{term:g.term,definition:g.definition,mainLectureId:g.mainLectureId,mainSlideId:g.mainSlideId,applications:[]});else concepts.get(key).applications.push({lectureId:g.mainLectureId,slideId:g.mainSlideId,questionId:g.questionId});}await writeFile('authoring/concept-matrix.json',formatJSON([...concepts.values()]));
await writeFile('public/legacy-links.json',formatJSON(Object.fromEntries(original.topics.map(t=>[t.id,Object.fromEntries(mapping.filter(x=>x.lectureId===t.id).map(x=>[x.oldSlide,x.targetSlideIds[0]]))]))));
await writeFile('reports/PROGRESS.md',`# Прогресс переработки\n\nВерсия ${version}. Шаблон ${sources.templateVersion}, ${sources.templateCommit}.\n\n15 лекций, 120 исходных вопросов сохранены. Данные скомпилированы.\n\nСледующие стадии: проверка данных; преподавательский комплект; production-сборка; браузер и PDF; публикация.\n\nОграничения: ${sources.limitations.join('\n\n')}\n`);
console.log(JSON.stringify({lectures:course.lectures.length,slides:course.lectures.reduce((n,l)=>n+l.slides.length,0),questions:questionMap.length,tests:Object.keys(bank.keys).length}));

