from pathlib import Path
import datetime, shutil, subprocess, sys
root=Path('/root/miniapp10x'); src=root/'public/miniapp/index.html'; live=Path('/srv/tenx-public/miniapp/index.html')
marker='TENX_Q14_STUDENT_DASHBOARD_V1'
anchor="        var sectionHead = document.createElement('div');"
if not src.exists() or not live.exists(): sys.exit('PREFLIGHT_FAIL=missing_index')
s=src.read_text(); l=live.read_text()
if marker in s or marker in l: sys.exit('PREFLIGHT_FAIL=already_installed_or_partial')
if s.count(anchor)!=1 or l.count(anchor)!=1: sys.exit('PREFLIGHT_FAIL=anchor_not_unique')
if s!=l: sys.exit('PREFLIGHT_FAIL=source_live_differ')
if 'quizPassed' not in s or 'isLocked' not in s: sys.exit('PREFLIGHT_FAIL=q13_not_found')
backup=root/'academy-content'/('Q14_BACKUP_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')); backup.mkdir(parents=True)
shutil.copy2(src,backup/'source_index.html'); shutil.copy2(live,backup/'live_index.html')
insert=r'''        // TENX_Q14_STUDENT_DASHBOARD_V1
        (function () {
          var allLessons = courses.reduce(function (a, c) { return a.concat(c.lessons || []); }, []);
          var passedLessons = allLessons.filter(function (x) { return x.quizPassed; }).length;
          var passedCourses = courses.filter(function (x) { return x.quizPassed; }).length;
          var stepsTotal = allLessons.length + courses.length;
          var stepsPassed = passedLessons + passedCourses;
          var mastery = stepsTotal ? Math.round(100 * stepsPassed / stepsTotal) : 0;
          var currentCourse = courses.find(function (c) { return !c.isLocked && !c.quizPassed; });
          var nextLesson = currentCourse && (currentCourse.lessons || []).find(function (x) { return !x.isLocked && !x.quizPassed; });
          var courseExam = currentCourse && !nextLesson && currentCourse.quizUnlocked && !currentCourse.quizPassed;
          var panel = document.createElement('section');
          panel.id = 'tenx-q14-dashboard';
          panel.setAttribute('aria-label', 'داشبورد پیشرفت دانشجو');
          panel.style.cssText = 'margin:18px 0 26px;padding:20px;border-radius:18px;background:#171a22;color:#f7f7f7;border:1px solid rgba(184,145,82,.38);font-family:inherit';
          function item(tag, value) { var n=document.createElement(tag);n.textContent=value;return n; }
          var head=item('h2','داشبورد پیشرفت من');head.style.cssText='font-size:19px;margin:0 0 8px';panel.append(head);
          var sub=item('p','پیشرفت واقعی بر اساس قبولی در آزمون‌ها');sub.style.cssText='font-size:12px;opacity:.75;margin:0 0 16px';panel.append(sub);
          var big=item('strong',mastery.toLocaleString('fa-IR')+'٪');big.style.cssText='font-size:32px;color:#d7b87a';panel.append(big);
          var bar=document.createElement('div');bar.style.cssText='height:9px;border-radius:20px;background:#343943;overflow:hidden;margin:10px 0 18px';
          var fill=document.createElement('div');fill.style.cssText='height:100%;background:#b89152;width:'+mastery+'%';bar.append(fill);panel.append(bar);
          var stats=document.createElement('div');stats.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px';
          [[passedLessons, 'درس قبول‌شده از '+allLessons.length],[passedCourses,'دوره قبول‌شده از '+courses.length]].forEach(function (entry) {
            var cell=document.createElement('div');cell.style.cssText='padding:12px;border-radius:12px;background:rgba(255,255,255,.06)';
            var val=item('strong',Number(entry[0]).toLocaleString('fa-IR'));val.style.cssText='display:block;color:#d7b87a;font-size:23px';
            var caption=item('span',entry[1]);caption.style.cssText='font-size:12px';cell.append(val,caption);stats.append(cell);
          });panel.append(stats);
          var next=item('p',stepsPassed===stepsTotal && stepsTotal>0 ? 'تمام مراحل آکادمی را با موفقیت گذرانده‌ای.' : nextLesson ? 'مرحله بعد: '+nextLesson.title : courseExam ? 'مرحله بعد: آزمون پایان '+currentCourse.title : 'مسیر یادگیری در حال بررسی است.');
          next.style.cssText='margin:16px 0 4px;font-size:13px;line-height:1.9';panel.append(next);
          if (nextLesson || courseExam) {
            var go=academyButton(courseExam ? 'رفتن به آزمون دوره' : 'ادامه یادگیری',function () {
              if (nextLesson) { openAcademyLesson(nextLesson.id);return; }
              var card=document.querySelector('[data-q13-course-id="'+currentCourse.id+'"]');
              if (card) { card.scrollIntoView({behavior:'smooth',block:'center'});return; }
              var heading=Array.from(document.querySelectorAll('.academy-course-card')).find(function (x) { return x.textContent.indexOf(currentCourse.title)>=0; });
              if (heading) heading.scrollIntoView({behavior:'smooth',block:'center'});
            });go.style.cssText='margin-top:12px;width:100%';panel.append(go);
          }
          root.append(panel);
        })();
        // END TENX_Q14_STUDENT_DASHBOARD_V1

'''
updated=s.replace(anchor,insert+anchor,1)
# Validate the inserted dashboard code separately.
result=subprocess.run(
 ['node','--check','-'],
 input='(function(){\n'+insert+'\n})();',
 text=True,capture_output=True
)
if result.returncode:
 sys.exit('JS_SYNTAX_FAIL='+result.stderr[:1200])
try:
 src.write_text(updated); live.write_text(updated)
 if src.read_bytes()!=live.read_bytes(): raise RuntimeError('sync failed')
 print('Q14_SOURCE_AND_LIVE=PASS');print('BACKUP='+str(backup));print('API_CHANGED=NO');print('DATABASE_CHANGED=NO');print('SERVICE_RESTART=NOT_REQUIRED')
except Exception as e:
 shutil.copy2(backup/'source_index.html',src);shutil.copy2(backup/'live_index.html',live)
 sys.exit('ROLLED_BACK='+str(e))
