#!/usr/bin/env python3
import pathlib, zipfile, hashlib, shutil, datetime, subprocess, sys, os
root=pathlib.Path('/root/miniapp10x')
archive=pathlib.Path(__file__).resolve().parent/'Q13_LOCK_PATCH_20261102.zip'
backup=root/'academy-content'/('Q13_BACKUP_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
paths=['apps/api/src/index.ts','public/miniapp/index.html','public/miniapp/tenx-quiz-ui.js']
if not archive.exists(): sys.exit('FAIL: patch ZIP missing')
with zipfile.ZipFile(archive) as z:
  for rel in paths:
    original=root/rel
    if not original.is_file(): sys.exit('FAIL: missing '+rel)
    current=original.read_text()
    if 'TENX_Q13_SEQUENTIAL_GATE' in current: sys.exit('FAIL: Q13 already installed')
    expected=z.read('baseline/'+rel).decode()
    # sanitized input cannot be compared bytewise; require exact anchors and structural checks
    if rel.endswith('index.ts') and not all(x in current for x in ["app.post('/academy/quizzes/start'", "app.post('/academy/lessons/:id/progress'", "app.post('/academy/courses'"]): sys.exit('FAIL: unexpected API')
    if rel.endswith('index.html') and 'academy-managed-content' not in current: sys.exit('FAIL: unexpected HTML')
    if rel.endswith('tenx-quiz-ui.js') and 'function renderStart()' not in current: sys.exit('FAIL: unexpected quiz UI')
  backup.mkdir(parents=True,exist_ok=False)
  for rel in paths:
    dest=backup/rel; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(root/rel,dest)
  print('BACKUP='+str(backup),flush=True)
  try:
    for rel in paths:
      current=(root/rel).read_text()
      # build patched from exact anchors on real source, preserving secrets and other source lines
      with zipfile.ZipFile(archive) as z:
        source=z.read('baseline/'+rel).decode()
        target=z.read('payload/'+rel).decode()
      import difflib
      # Apply edit opcodes to original using matching context; sanitized lines are preserved if unchanged
      sm=difflib.SequenceMatcher(None,source.splitlines(keepends=True),target.splitlines(keepends=True),autojunk=False)
      old=source.splitlines(keepends=True); new=target.splitlines(keepends=True); real=current.splitlines(keepends=True)
      # verify unchanged spans excluding redacted lines
      if len(real)!=len(old): raise RuntimeError('source line count drift: '+rel)
      for i,(a,b) in enumerate(zip(old,real)):
        if a!=b and '[REDACTED SECRET LINE]' not in a: raise RuntimeError('source drift '+rel+' line '+str(i+1))
      result=[]
      for tag,i1,i2,j1,j2 in sm.get_opcodes():
        if tag=='equal': result.extend(real[i1:i2])
        else:
          if any('[REDACTED SECRET LINE]' in x for x in old[i1:i2]): raise RuntimeError('redacted line edit unsafe')
          result.extend(new[j1:j2])
      (root/rel).write_text(''.join(result))
    js=root/'public/miniapp/tenx-quiz-ui.js'
    if subprocess.run(['node','--check',str(js)],capture_output=True).returncode: raise RuntimeError('JS syntax failed')
    print('SOURCE_PATCHED=PASS',flush=True)
    print('LIVE_PUBLISHED=NO; BUILD_AND_API_RESTART_PENDING',flush=True)
  except Exception as e:
    for rel in paths: shutil.copy2(backup/rel,root/rel)
    for rel in ['public/miniapp/index.html','public/miniapp/tenx-quiz-ui.js']:
      live=pathlib.Path('/srv/tenx-public')/rel.replace('public/',''); old=backup/'live'/rel
      if old.exists(): shutil.copy2(old,live)
    sys.exit('ROLLED_BACK: '+str(e))
