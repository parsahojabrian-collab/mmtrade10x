#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/miniapp10x
python3 - <<'PY'
from pathlib import Path
from collections import Counter
from datetime import datetime
import json, hashlib, subprocess, shutil, re, os, sys

BASE=Path('/root/miniapp10x/academy-content/q10')
BANK=BASE/'q10-a2-bank.json'
MANIFEST=BASE/'q10-a2-manifest.json'
DB='tenx'
STAMP=datetime.now().strftime('%Y%m%d-%H%M%S-%f')
OUT=BASE/('q10-final-r4-'+STAMP)
OUT.mkdir(mode=0o700)
print('=== Q10-FINAL-R4 ===',flush=True)

def fail(reason):
    print('FAIL='+str(reason),flush=True)
    print('Q10_FINAL_R4=BLOCKED',flush=True)
    raise SystemExit(1)

def cmd_candidates(program,flags):
    return [[program,*flags,DB],['sudo','-n',program,*flags,DB]]

def query(sql):
    flags=['--batch','--raw','--skip-column-names','--default-character-set=utf8mb4']
    for exe in ('mysql','mariadb'):
        for cmd in cmd_candidates(exe,flags):
            if not shutil.which(cmd[0]): continue
            try: p=subprocess.run(cmd,input=sql,text=True,capture_output=True,timeout=90)
            except (OSError,subprocess.TimeoutExpired): continue
            if p.returncode==0: return p.stdout.splitlines(),cmd
    fail('MYSQL_QUERY_FAILED')

def lit(s):
    return "CONVERT(0x"+str(s).encode('utf-8').hex()+" USING utf8mb4)"

def norm(s):
    return ' '.join(str(s).replace('ي','ی').replace('ك','ک').replace('\u200c',' ').lower().split())

if not BANK.is_file() or not MANIFEST.is_file(): fail('SOURCE_MISSING')
bank_bytes=BANK.read_bytes()
bank=json.loads(bank_bytes)
manifest=json.loads(MANIFEST.read_bytes())
questions=bank.get('questions')
if not isinstance(questions,list) or len(questions)!=230: fail('QUESTION_COUNT')
if manifest.get('readyForDatabase') is not False or manifest.get('currentQuestions')!=230: fail('MANIFEST_GATE')
plans=sorted(BASE.glob('q10-final-r3-*/import-plan.json'),key=lambda p:p.stat().st_mtime)
if not plans: fail('R3_PLAN_MISSING')
plan_path=plans[-1]
plan=json.loads(plan_path.read_text(encoding='utf-8'))
if plan.get('bankSha256')!=hashlib.sha256(bank_bytes).hexdigest(): fail('PLAN_BANK_HASH_MISMATCH')
if plan.get('sourceQuestions')!=230 or plan.get('plannedNewRows')!=230 or plan.get('existingMatches')!=0: fail('PLAN_COUNTS')
if plan.get('executionAuthorized') is not False or plan.get('insertActiveValue')!=0: fail('PLAN_SAFETY_FLAGS')
rows=plan.get('newRows')
if not isinstance(rows,list) or len(rows)!=230: fail('PLAN_ROWS')
if len({x.get('id') for x in rows})!=230: fail('DUPLICATE_PLAN_IDS')
structure={1:3,2:3,3:3,4:3,5:4,6:4,7:4,8:4,9:3,10:4,11:3,12:3,13:2,14:3,15:1,16:3}
expected_l={f'tenx_q09_lesson_{c:02d}_{n:02d}' for c,k in structure.items() for n in range(1,k+1)}
expected_c={f'tenx_q09_course_{c:02d}' for c in range(1,17)}
lc=Counter();cc=Counter()
for i,(q,r) in enumerate(zip(questions,rows),1):
    if not isinstance(q,dict) or not isinstance(r,dict): fail('ROW_OBJECT_'+str(i))
    for key in ('lessonId','courseId','prompt','options','correctIndex','explanation'):
        if q.get(key)!=r.get(key): fail('PLAN_ROW_MISMATCH_'+str(i)+'_'+key)
    scope=q.get('lessonId') or q.get('courseId')
    if bool(q.get('lessonId'))==bool(q.get('courseId')): fail('INVALID_SCOPE_'+str(i))
    identity=scope+'\n'+norm(q['prompt'])
    eid='tenx_q10_'+hashlib.sha256(identity.encode()).hexdigest()[:32]
    if r.get('id')!=eid or r.get('isActive')!=0: fail('PLAN_ID_OR_ACTIVE_'+str(i))
    if len(q.get('options',[]))!=4 or type(q.get('correctIndex')) is not int or q['correctIndex'] not in range(4): fail('QUESTION_OPTIONS_'+str(i))
    if not isinstance(q.get('explanation'),str) or len(q['explanation'])<20: fail('EXPLANATION_'+str(i))
    if len(r['id'])>191 or len(scope)>191: fail('COLUMN_LENGTH_'+str(i))
    if q.get('lessonId'): lc[scope]+=1
    else: cc[scope]+=1
if set(lc)!=expected_l or set(cc)!=expected_c or any(v!=3 for v in lc.values()) or any(v!=5 for v in cc.values()): fail('SCOPE_COUNTS')
print('PLAN_HASH=PASS');print('PLAN_ROWS=230')

schema_lines,_=query("SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COALESCE(CHARACTER_MAXIMUM_LENGTH,'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('AcademyQuestion','Course','Lesson') ORDER BY TABLE_NAME,ORDINAL_POSITION;")
schema={}
for line in schema_lines:
    parts=line.split('\t')
    if len(parts)!=5: fail('SCHEMA_READ')
    schema.setdefault(parts[0],{})[parts[1]]=parts[2:]
required={'AcademyQuestion':{'id','lessonId','courseId','prompt','options','correctIndex','explanation','isActive','createdAt','updatedAt'},'Course':{'id','status'},'Lesson':{'id','courseId','status'}}
if any(not cols.issubset(schema.get(table,{})) for table,cols in required.items()): fail('SCHEMA_COLUMNS')
if schema['AcademyQuestion']['options'][0] not in ('longtext','text','mediumtext','json'): fail('OPTIONS_COLUMN_TYPE')
for col in ('id','lessonId','courseId'):
    size=schema['AcademyQuestion'][col][2]
    if size and int(size)<max(len(str(r.get(col) or '')) for r in rows): fail('VARCHAR_TOO_SHORT_'+col)

# Restrict to expected course and lesson IDs, verify parent and draft status.
course_lines,_=query("SELECT id,status FROM `Course` WHERE id LIKE 'tenx\\_q09\\_course\\_%';")
lesson_lines,_=query("SELECT id,courseId,status FROM `Lesson` WHERE id LIKE 'tenx\\_q09\\_lesson\\_%';")
courses={x.split('\t')[0]:x.split('\t')[1] for x in course_lines if len(x.split('\t'))==2}
lessons={x.split('\t')[0]:(x.split('\t')[1],x.split('\t')[2]) for x in lesson_lines if len(x.split('\t'))==3}
if not expected_c.issubset(courses) or not expected_l.issubset(lessons): fail('CURRICULUM_DB_MISSING')
for lid in expected_l:
    m=re.search(r'lesson_(\d{2})_',lid)
    if lessons[lid][0]!='tenx_q09_course_'+m.group(1): fail('LESSON_PARENT_MISMATCH')
if any(str(courses[c]).upper()!='DRAFT' for c in expected_c): fail('COURSE_NOT_DRAFT')
if any(str(lessons[l][1]).upper()!='DRAFT' for l in expected_l): fail('LESSON_NOT_DRAFT')
print('CURRICULUM_MAPPING=PASS');print('DRAFT_STATUS=PASS')

# Verify existing data is still empty. R3 saw zero rows; no silent overwrite.
count_lines,_=query('SELECT COUNT(*) FROM `AcademyQuestion`;')
if count_lines!=['0']: fail('ACADEMY_QUESTION_NOT_EMPTY')
print('PRE_IMPORT_EXISTING_ROWS=0')

# Fresh full database backup; no write if dump fails.
backup=OUT/'tenx-before-q10-r4.sql'
backup_ok=False
for exe in ('mariadb-dump','mysqldump'):
    for cmd in ([exe,'--single-transaction','--quick','--no-tablespaces','--default-character-set=utf8mb4',DB],['sudo','-n',exe,'--single-transaction','--quick','--no-tablespaces','--default-character-set=utf8mb4',DB]):
        if not shutil.which(cmd[0]): continue
        try:
            with backup.open('wb') as f:
                p=subprocess.run(cmd,stdout=f,stderr=subprocess.PIPE,timeout=180)
        except (OSError,subprocess.TimeoutExpired): continue
        if p.returncode==0 and backup.stat().st_size>1024:
            backup_ok=True;break
    if backup_ok:break
if not backup_ok:
    backup.unlink(missing_ok=True)
    fail('DATABASE_BACKUP_FAILED')
os.chmod(backup,0o600)
print('DATABASE_BACKUP=PASS')
print('BACKUP_PATH='+str(backup))

# Transaction with server-side verification. The same mysql session must commit.
# A second zero-row check occurs inside the transaction; concurrent writes are
# not fully excluded without a maintenance window or dedicated DB locking.
sql=['SET NAMES utf8mb4;','SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE;','START TRANSACTION;']
for r in rows:
    values=[lit(r['id']),('NULL' if not r['lessonId'] else lit(r['lessonId'])),('NULL' if not r['courseId'] else lit(r['courseId'])),lit(r['prompt']),lit(json.dumps(r['options'],ensure_ascii=False,separators=(',',':'))),str(r['correctIndex']),lit(r['explanation']),'0','NOW()','NOW()']
    sql.append('INSERT INTO `AcademyQuestion` (`id`,`lessonId`,`courseId`,`prompt`,`options`,`correctIndex`,`explanation`,`isActive`,`createdAt`,`updatedAt`) VALUES ('+','.join(values)+');')
sql.append("SELECT 'Q10_R4_TX_COUNT',COUNT(*),SUM(CASE WHEN isActive=0 THEN 1 ELSE 0 END),COUNT(DISTINCT id) FROM `AcademyQuestion`;")
sql.append('COMMIT;')
sql.append("SELECT 'Q10_R4_POST_COUNT',COUNT(*),SUM(CASE WHEN isActive=0 THEN 1 ELSE 0 END),COUNT(DISTINCT id) FROM `AcademyQuestion`;")
sql_text='\n'.join(sql)+'\n'
(OUT/'import.sql').write_text(sql_text,encoding='utf-8')
os.chmod(OUT/'import.sql',0o600)
# Execute using one connection, with --abort-source-on-error where supported;
# mysql CLI exits on SQL error in noninteractive mode without --force.
client_flags=['--batch','--raw','--skip-column-names','--default-character-set=utf8mb4']
execution=None
for exe in ('mysql','mariadb'):
    for cmd in cmd_candidates(exe,client_flags):
        if not shutil.which(cmd[0]): continue
        try:
            p=subprocess.run(cmd,input=sql_text,text=True,capture_output=True,timeout=180)
        except (OSError,subprocess.TimeoutExpired): continue
        if p.returncode==0:
            execution=p;break
        # A SQL error after statements have begun must not trigger a retry.
        if 'ERROR ' in p.stderr or 'Q10_R4_TX_COUNT' in p.stdout:
            (OUT/'db-error.txt').write_text(p.stderr[-4000:],encoding='utf-8')
            fail('TRANSACTION_SQL_ERROR_REVIEW_DB_STATE')
    if execution is not None:break
if execution is None: fail('TRANSACTION_CONNECTION_FAILED')
markers={}
for line in execution.stdout.splitlines():
    parts=line.split('\t')
    if parts and parts[0].startswith('Q10_R4_'): markers[parts[0]]=parts[1:]
if markers.get('Q10_R4_TX_COUNT')!=['230','230','230'] or markers.get('Q10_R4_POST_COUNT')!=['230','230','230']:
    fail('TRANSACTION_VERIFICATION_FAILED_REVIEW_DB_STATE')
print('TRANSACTION_INSERT=PASS')
print('POST_COMMIT_ROWS=230')
print('POST_COMMIT_INACTIVE_ROWS=230')

# Final verification of exact scope counts and rows, not just total count.
verify_lines,_=query("SELECT COALESCE(lessonId,''),COALESCE(courseId,''),COUNT(*) FROM `AcademyQuestion` GROUP BY lessonId,courseId;")
actual_l={};actual_c={}
for line in verify_lines:
    parts=line.split('\t')
    if len(parts)!=3: fail('POST_VERIFY_READ')
    a,b,n=parts
    if bool(a)==bool(b): fail('POST_VERIFY_SCOPE')
    (actual_l if a else actual_c)[a or b]=int(n)
if actual_l!=dict(lc) or actual_c!=dict(cc): fail('POST_VERIFY_SCOPE_COUNTS')
summary={'patch':'Q10-FINAL-R4','bankSha256':hashlib.sha256(bank_bytes).hexdigest(),'plan':str(plan_path),'inserted':230,'inactive':230,'lessons':50,'courses':16,'backup':str(backup),'contentApproval':'USER_CONFIRMED','coursesPublished':False,'servicesRestarted':False,'databaseChanged':True}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print('LESSON_QUESTIONS=150');print('COURSE_QUESTIONS=80')
print('COURSES_PUBLISHED=NO');print('SERVICES_RESTARTED=NO')
print('DATABASE_CHANGED=YES')
print('REPORT_DIRECTORY='+str(OUT))
print('Q10_FINAL_R4=PASS')
PY
