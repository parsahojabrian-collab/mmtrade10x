#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/miniapp10x
python3 - <<'PY'
from pathlib import Path
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
import json, subprocess, hashlib, os, re, shutil, stat

ROOT=Path('/root/miniapp10x'); Q=ROOT/'academy-content/q10'
BANK=Q/'q10-a2-bank.json'; MANIFEST=Q/'q10-a2-manifest.json'
STAMP=datetime.now().strftime('%Y%m%d-%H%M%S-%f')
OUT=Q/('q10-final-r1-'+STAMP); OUT.mkdir(parents=True,exist_ok=False)
issues=[]; checks={}; evidence={}; artifacts={}
def check(name, ok, details=None, blocking=True):
    checks[name]={'status':'PASS' if ok else ('BLOCKED' if blocking else 'REVIEW'),'details':details}
    if not ok: issues.append({'check':name,'severity':'BLOCKER' if blocking else 'REVIEW','details':details})
def run(cmd, timeout=90, stdin=None):
    try:
        p=subprocess.run(cmd,input=stdin,text=True,capture_output=True,timeout=timeout,check=False)
        return p.returncode,p.stdout,p.stderr
    except (OSError,subprocess.TimeoutExpired) as e:
        return 127,'',type(e).__name__+': '+str(e)
def dump(name,obj):
    p=OUT/name;p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf-8');return str(p)
def norm(s):
    return ' '.join(re.sub(r'[^\w\s]',' ',str(s).replace('ي','ی').replace('ك','ک').replace('\u200c',' ')).lower().split())
print('=== Q10-FINAL-R1 ===',flush=True)
if not BANK.is_file() or not MANIFEST.is_file():
    check('SOURCE_FILES',False,'Missing bank or manifest')
    dump('report.json',{'checks':checks,'issues':issues});print('Q10_FINAL_R1=BLOCKED');raise SystemExit(2)
try:
    bb=BANK.read_bytes(); mb=MANIFEST.read_bytes(); bank=json.loads(bb); manifest=json.loads(mb)
    questions=bank['questions']
    assert isinstance(questions,list)
    check('SOURCE_JSON',True)
except Exception as e:
    check('SOURCE_JSON',False,str(e));dump('report.json',{'checks':checks,'issues':issues});print('Q10_FINAL_R1=BLOCKED');raise SystemExit(2)

structure={1:3,2:3,3:3,4:3,5:4,6:4,7:4,8:4,9:3,10:4,11:3,12:3,13:2,14:3,15:1,16:3}
less={f'tenx_q09_lesson_{c:02d}_{l:02d}' for c,n in structure.items() for l in range(1,n+1)}
courses={f'tenx_q09_course_{c:02d}' for c in range(1,17)}
lc=Counter();cc=Counter(); seen={};bad=[]; generic=[]; near=[]
for i,q in enumerate(questions,1):
    if not isinstance(q,dict):bad.append([i,'not_object']);continue
    lid=q.get('lessonId');cid=q.get('courseId');prompt=q.get('prompt');opts=q.get('options');idx=q.get('correctIndex');ex=q.get('explanation')
    if bool(lid)==bool(cid):bad.append([i,'scope'])
    elif lid:lc[lid]+=1
    else:cc[cid]+=1
    if not isinstance(prompt,str) or len(prompt.strip())<10:bad.append([i,'prompt']);continue
    np=norm(prompt)
    if np in seen:bad.append([i,'duplicate_prompt',seen[np]])
    seen[np]=i
    if not isinstance(opts,list) or len(opts)!=4 or any(not isinstance(x,str) or not x.strip() for x in opts) or len({norm(x) for x in opts})!=4:bad.append([i,'options'])
    if type(idx)!=int or not 0<=idx<=3:bad.append([i,'correctIndex'])
    if not isinstance(ex,str) or len(ex.strip())<20:bad.append([i,'explanation'])
    if isinstance(ex,str) and 'این گزینه با مفهوم مورد سنجش در سؤال سازگار است' in ex:generic.append(i)
check('QUESTION_BANK_VALID',len(questions)==230 and not bad and not generic and set(lc)==less and set(cc)==courses and all(n==3 for n in lc.values()) and all(n==5 for n in cc.values()),{'total':len(questions),'lessons':len(lc),'courses':len(cc),'bad':bad[:30],'generic_explanations':generic[:30]})
check('MANIFEST_VALID',manifest.get('currentQuestions')==230 and manifest.get('remainingQuestions')==0 and manifest.get('readyForDatabase') is False,{'currentQuestions':manifest.get('currentQuestions'),'remainingQuestions':manifest.get('remainingQuestions'),'readyForDatabase':manifest.get('readyForDatabase')})
for a in range(len(questions)):
    qa=questions[a]
    if not isinstance(qa,dict) or not isinstance(qa.get('prompt'),str):continue
    for b in range(a+1,len(questions)):
        qb=questions[b]
        if not isinstance(qb,dict) or not isinstance(qb.get('prompt'),str):continue
        x=norm(qa['prompt']);y=norm(qb['prompt'])
        if x!=y and SequenceMatcher(None,x,y,autojunk=False).ratio()>=.88:near.append({'a':a+1,'b':b+1,'aPrompt':qa['prompt'],'bPrompt':qb['prompt']})
dump('near_duplicates.json',near)
check('NEAR_DUPLICATE_REVIEW',len(near)==0,{'pairs':near},blocking=False)
check('CONTENT_APPROVAL',False,'Scientific review and proprietary 10X alignment have not been signed off',blocking=False)

# Find actual curriculum evidence; do not assume a schema.
candidates=sorted(Path('/root/10x-backups').glob('q09-*/curriculum.json')) if Path('/root/10x-backups').exists() else []
candidates += sorted((ROOT/'academy-content').rglob('*curriculum*.json')) if (ROOT/'academy-content').exists() else []
candidates=[p for p in candidates if p.is_file()]
if candidates:
    cp=candidates[-1]
    try:
        raw=cp.read_text(encoding='utf-8'); curr=json.loads(raw)
        evidence['curriculum']={'path':str(cp),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'bytes':len(raw)}
        def collect_ids(v,acc):
            if isinstance(v,dict):
                for k,x in v.items():
                    if k in ('id','lessonId','courseId') and isinstance(x,str):acc.add(x)
                    collect_ids(x,acc)
            elif isinstance(v,list):
                for x in v:collect_ids(x,acc)
        ids=set();collect_ids(curr,ids)
        # When IDs are not in source, cannot certify linkage.
        check('CURRICULUM_LINKS',less.issubset(ids) and courses.issubset(ids),{'file':str(cp),'recognized_ids':len(ids),'missing_lessons':sorted(less-ids)[:15],'missing_courses':sorted(courses-ids)[:15]})
    except Exception as e:check('CURRICULUM_LINKS',False,str(e))
else:check('CURRICULUM_LINKS',False,'No curriculum JSON located')

# Read-only schema inspection; never log credentials.
mysql=shutil.which('mariadb') or shutil.which('mysql')
mysqldump=shutil.which('mariadb-dump') or shutil.which('mysqldump')
check('MYSQL_CLIENT',bool(mysql and mysqldump),{'client_found':bool(mysql),'dump_found':bool(mysqldump)})
db='tenx'
if mysql:
    rc,out,err=run([mysql,'--batch','--skip-column-names','--database',db,'-e','SELECT DATABASE(), VERSION();'],timeout=20)
    connected=rc==0
    check('DATABASE_CONNECTION',connected,'Connected via local client defaults' if connected else 'Local credentials unavailable or connection failed: '+err[:250])
else:connected=False;check('DATABASE_CONNECTION',False,'No MySQL/MariaDB CLI')

if connected:
    rc,out,err=run([mysql,'--batch','--skip-column-names','--database',db,'-e',"SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION;"],timeout=40)
    schema=[]
    if rc==0:
        for line in out.splitlines():
            fields=line.split('\t')
            if len(fields)>=5:schema.append({'table':fields[0],'column':fields[1],'type':fields[2],'nullable':fields[3],'key':fields[4]})
    dump('db_schema.json',schema)
    check('DATABASE_SCHEMA_CHECK',rc==0 and bool(schema),{'tables':len(set(x['table'] for x in schema)),'columns':len(schema),'error':err[:200]})
    # An import target must be explicit: never infer which table receives content.
    candidates_tables=sorted({x['table'] for x in schema if any(t in x['table'].lower() for t in ('quiz','question','academy','course','lesson'))})
    check('IMPORT_MAPPING_CONFIRMED',False,{'candidate_tables':candidates_tables,'reason':'Import table/column mapping must be reviewed against API implementation'},blocking=True)
    check('DUPLICATE_IMPORT_CHECK',False,'Cannot prove absence of duplicate imports until exact target table and key mapping are verified',blocking=True)
else:
    check('DATABASE_SCHEMA_CHECK',False,'Database connection unavailable')
    check('IMPORT_MAPPING_CONFIRMED',False,'Database schema unavailable')
    check('DUPLICATE_IMPORT_CHECK',False,'Database schema unavailable')

# Backup only if authenticated and dump utility exists. No password on command line.
if connected and mysqldump:
    backup=OUT/'tenx-before-q10-import.sql'
    # Write via subprocess to avoid loading DB into memory.
    cmd=[mysqldump,'--single-transaction','--quick','--routines','--triggers','--events','--databases',db]
    try:
        with backup.open('wb') as f:
            proc=subprocess.run(cmd,stdout=f,stderr=subprocess.PIPE,timeout=240,check=False)
        if proc.returncode==0 and backup.stat().st_size>100:
            os.chmod(backup,0o600)
            artifacts['database_backup']={'path':str(backup),'bytes':backup.stat().st_size,'sha256':hashlib.sha256(backup.read_bytes()).hexdigest()}
            check('DATABASE_BACKUP',True,artifacts['database_backup'])
        else:
            backup.unlink(missing_ok=True)
            check('DATABASE_BACKUP',False,'Dump command failed: '+proc.stderr.decode(errors='replace')[:250])
    except Exception as e:
        backup.unlink(missing_ok=True)
        check('DATABASE_BACKUP',False,type(e).__name__+': '+str(e))
else:check('DATABASE_BACKUP',False,'Database not connected or dump utility missing')

# A non-mutating import plan, NOT a DB transaction simulation.
plan={'status':'NOT_EXECUTED','question_count':len(questions),'lesson_scopes':len(lc),'course_scopes':len(cc),'requires':['confirmed schema mapping','duplicate-key policy','scientific content approval','10X proprietary-content approval','transactional import with rollback'],'database_writes':0}
dump('import_plan.json',plan)
check('IMPORT_DRY_RUN',False,'No actual SQL dry-run can be certified before mapping; generated non-executing plan only',blocking=True)

report={'patch':'Q10-FINAL-R1','timestamp':STAMP,'bank_sha256':hashlib.sha256(bb).hexdigest(),'manifest_sha256':hashlib.sha256(mb).hexdigest(),'checks':checks,'issues':issues,'artifacts':artifacts,'evidence':evidence,'question_count':len(questions),'lesson_count':len(lc),'course_count':len(cc),'database_changed':False,'services_restarted':False,'courses_published':False,'ready_for_database':False}
dump('report.json',report)
(OUT/'REPORT.txt').write_text('\n'.join([f'{k}={v["status"]} | {v["details"]}' for k,v in checks.items()])+'\n',encoding='utf-8')
print('QUESTIONS=',len(questions));print('LESSONS=',len(lc));print('COURSES=',len(cc))
for k,v in checks.items():print(k+'='+v['status'])
print('REPORT_DIRECTORY='+str(OUT))
print('DATABASE_CHANGED=NO');print('SERVICES_RESTARTED=NO');print('COURSES_PUBLISHED=NO')
print('CONTENT_APPROVAL=PENDING');print('READY_FOR_DATABASE=NO')
blocked=[k for k,v in checks.items() if v['status']=='BLOCKED']
print('Q10_FINAL_R1='+('BLOCKED' if blocked else 'PASS'))
print('BLOCKING_CHECKS='+','.join(blocked))
PY
