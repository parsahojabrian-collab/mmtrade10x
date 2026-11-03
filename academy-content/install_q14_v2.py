from pathlib import Path
import hashlib,datetime,shutil,subprocess,sys,re,os
root=Path('/root/miniapp10x'); source=root/'public/miniapp/index.html'; live=Path('/srv/tenx-public/miniapp/index.html')
expected='4fbe652241710050003074cd1ed5cf61667616d09105213fefb13838b61e9c64'
marker='TENX_Q14_V2_INTEGRATED'
if not source.is_file() or not live.is_file(): sys.exit('PREFLIGHT_FAIL=MISSING_HTML')
s=source.read_text(); l=live.read_text()
if hashlib.sha256(s.encode()).hexdigest()!=expected or s!=l: sys.exit('PREFLIGHT_FAIL=SOURCE_CHANGED_OR_LIVE_DIFFERENT; NO_WRITE')
if marker in s: sys.exit('PREFLIGHT_FAIL=ALREADY_INSTALLED')
def replace_once(old,new):
 global s
 if s.count(old)!=1: sys.exit('PREFLIGHT_FAIL=ANCHOR_COUNT_'+str(s.count(old))+' '+repr(old[:45]))
 s=s.replace(old,new,1)
# Existing course/lesson cards stay; unify the summary instead of inserting a second panel.
a=s.index('        // TENX_Q14_STUDENT_DASHBOARD_V1'); b=s.index('        // END TENX_Q14_STUDENT_DASHBOARD_V1',a)+len('        // END TENX_Q14_STUDENT_DASHBOARD_V1')
s=s[:a]+s[b:]
replace_once('''          completedLessons += lessons.filter(function (lesson) {
            return !!lesson.done;
          }).length;''','''          completedLessons += lessons.filter(function (lesson) {
            return !!lesson.quizPassed;
          }).length;''')
replace_once('''        var percent = totalLessons
          ? Math.round(completedLessons * 100 / totalLessons)
          : 0;''','''        // TENX_Q14_V2_INTEGRATED: count passed lesson and course exams, not video views.
        var passedCourses = courses.filter(function (c) { return !!c.quizPassed; }).length;
        var totalAssessments = totalLessons + courses.length;
        var percent = totalAssessments
          ? Math.round((completedLessons + passedCourses) * 100 / totalAssessments) : 0;''')
replace_once("addStat(completedLessons, 'درس تکمیل‌شده');", "addStat(completedLessons, 'آزمون درس قبول‌شده');")
replace_once('''        overview.append(overviewHead, track, stats);
        root.append(overview);''','''        addStat(passedCourses, 'آزمون دوره قبول‌شده');
        overview.append(overviewHead, track, stats);
        var next = tenxQ14Next(courses);
        var nextBox = document.createElement('div');
        nextBox.style.cssText = 'margin-top:18px;padding:14px;border-radius:14px;border:1px solid rgba(57,255,136,.25);background:rgba(57,255,136,.055)';
        var nextTitle = document.createElement('strong');
        nextTitle.textContent = next.title;
        nextTitle.style.cssText = 'display:block;margin-bottom:10px';
        nextBox.append(nextTitle);
        if (next.kind === 'lesson' || next.kind === 'course') {
          var go = academyButton('ادامه یادگیری', function () {
            if (next.kind === 'lesson') openAcademyLesson(next.lessonId);
            else tenxQ14OpenCourseQuiz(next.courseId);
          });
          nextBox.append(go);
        }
        overview.append(nextBox);
        root.append(overview);''')
# A small shared resolver; never select locked content.
anchor='    function loadAcademy() {'
shared='''    // TENX_Q14_V2_INTEGRATED
    function tenxQ14Next(courses) {
      var firstLocked = false;
      for (var i = 0; i < courses.length; i++) {
        var c = courses[i];
        if (c.isLocked) { firstLocked = true; break; }
        var lessons = Array.isArray(c.lessons) ? c.lessons : [];
        for (var j = 0; j < lessons.length; j++) {
          var lesson = lessons[j];
          if (!lesson.quizPassed) {
            if (lesson.isLocked) return {kind:'locked',title:'برای ادامه، ابتدا آزمون درس قبلی را قبول شو'};
            return {kind:'lesson',lessonId:lesson.id,title:'درس بعدی: '+(lesson.title || 'درس آکادمی')};
          }
        }
        if (!c.quizPassed) {
          if (c.quizUnlocked) return {kind:'course',courseId:c.id,title:'آزمون پایان دوره: '+(c.title || 'دوره آکادمی')};
          return {kind:'locked',title:'آزمون پایان دوره هنوز فعال نشده است'};
        }
      }
      return firstLocked ? {kind:'locked',title:'دوره بعدی هنوز قفل است'} : {kind:'complete',title:'آکادمی را با موفقیت تکمیل کردی'};
    }
    function tenxQ14OpenCourseQuiz(courseId) {
      var cards = Array.from(document.querySelectorAll('.academy-course-card'));
      var card = cards.find(function (x) { return x.getAttribute('data-q14-course-id') === String(courseId); });
      if (!card) return;
      var button = Array.from(card.querySelectorAll('button')).find(function (b) { return b.textContent.indexOf('آزمون پایان دوره') !== -1; });
      if (button && !button.disabled) button.click();
      else card.scrollIntoView({behavior:'smooth',block:'center'});
    }
    function tenxQ14LoadSummary() {
      return post('/academy/courses').then(function (data) {
        if (!data || !Array.isArray(data.items)) throw new Error('ACADEMY_DATA_INVALID');
        var courses = data.items;
        var lessons = courses.reduce(function (n,c) { return n + (Array.isArray(c.lessons) ? c.lessons.length : 0); },0);
        var passedLessons = courses.reduce(function (n,c) { return n + (Array.isArray(c.lessons) ? c.lessons.filter(function(l){return !!l.quizPassed;}).length : 0); },0);
        var passedCourses = courses.filter(function(c){return !!c.quizPassed;}).length;
        return {percent: lessons+courses.length ? Math.round(100*(passedLessons+passedCourses)/(lessons+courses.length)) : 0,
          passedLessons:passedLessons, passedCourses:passedCourses, lessons:lessons, courses:courses.length,
          next:tenxQ14Next(courses)};
      });
    }
    function tenxQ14RenderSummary(summary) {
      if (profileMode) {
        var old = $('profile-progress'); if (old) old.remove();
        var host = $('profile-data'); if (!host) return;
        var card = document.createElement('section');card.id='profile-progress';card.className='card';
        card.style.cssText='padding:20px;margin:12px 0;line-height:2;border:1px solid rgba(57,255,136,.2)';
        var heading=document.createElement('h2');heading.textContent='پیشرفت آکادمی من';card.append(heading);
        var value=document.createElement('strong');value.textContent=summary.percent.toLocaleString('fa-IR')+'٪';
        value.style.cssText='font-size:30px;color:#39ff88';card.append(value);
        var info=document.createElement('p');info.textContent=summary.passedLessons.toLocaleString('fa-IR')+' از '+summary.lessons.toLocaleString('fa-IR')+' آزمون درس · '+summary.passedCourses.toLocaleString('fa-IR')+' از '+summary.courses.toLocaleString('fa-IR')+' آزمون دوره';card.append(info);
        var bar=document.createElement('div');bar.style.cssText='height:9px;border-radius:9px;background:#263244;overflow:hidden';
        var fill=document.createElement('div');fill.style.cssText='height:100%;background:#39ff88;width:'+summary.percent+'%';bar.append(fill);card.append(bar);host.append(card);
      } else if (!academyMode) {
        var title=$('next-title'), description=$('next-description'), action=$('next-action');
        if (!title || !action) return;
        title.textContent=summary.next.title;
        description.textContent=summary.next.kind==='complete'?'تمام آزمون‌های آموزشی را با موفقیت گذرانده‌ای.':'مسیر آموزشی آکادمی 10X';
        if (summary.next.kind==='lesson') {
          action.href='/miniapp/?view=academy&lessonId='+encodeURIComponent(summary.next.lessonId);action.hidden=false;action.textContent='ادامه';
        } else if (summary.next.kind==='course') {
          action.href='/miniapp/?view=academy&courseQuizId='+encodeURIComponent(summary.next.courseId);action.hidden=false;action.textContent='آزمون';
        } else {action.hidden=true;}
      }
    }
    // END TENX_Q14_V2_INTEGRATED
'''
replace_once(anchor,shared+anchor)
replace_once("          card.className = 'academy-course-card';", "          card.className = 'academy-course-card';\n          card.setAttribute('data-q14-course-id', String(course.id));")
replace_once('''        courses.forEach(function (course, courseIndex) {''','''        courses.forEach(function (course, courseIndex) {''')
# Open course quiz only after the cards have been created.
replace_once('''          root.append(card);
        });
      }).catch(function (error) {''','''          root.append(card);
        });
        var targetCourse = new URLSearchParams(location.search).get('courseQuizId');
        if (targetCourse) tenxQ14OpenCourseQuiz(targetCourse);
      }).catch(function (error) {''')
# Do not let the challenge progress overwrite the academy next-step result.
replace_once('''      var next = data.nextStep;
      if (next) {''','''      var next = data.nextStep;
      if (next) {''')
# Keep existing challenge stats; replace only the next-step panel after progress/path completes.
replace_once('''      showMessage('');
    }

    if (academyMode) {''','''      showMessage('');
    }

    if (academyMode) {''')
replace_once('''      renderProfile(auth.user);
      return post('/progress/path').then(renderProgress).catch(function (error) {''','''      renderProfile(auth.user);
      return post('/progress/path').then(renderProgress).catch(function (error) {''')
# Fetch after progress path promise settles (success/failure), not before, to prevent overwrites.
replace_once('''      });
    }).catch(function (error) {
      $('user-name').textContent = 'احراز هویت ناموفق';''','''      }).then(function () {
        return tenxQ14LoadSummary().then(tenxQ14RenderSummary).catch(function () {
          if (!profileMode) {
            $('next-title').textContent='مرحله بعدی آکادمی فعلاً در دسترس نیست';
            $('next-description').textContent='دوباره تلاش کن';
            $('next-action').hidden=true;
          }
        });
      });
    }).catch(function (error) {
      $('user-name').textContent = 'احراز هویت ناموفق';''')
# Preserve other inline scripts; repair one existing unterminated quoted URL (a verified syntax defect).
replace_once("  script.src = '/miniapp/tenx-quiz-ui.js?v=q12publicv2_20261102\n", "  script.src = '/miniapp/tenx-quiz-ui.js?v=q12publicv2_20261102';\n")
# Validate the main inline script and the repaired preview script separately.
blocks=re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script\s*>',s,re.I)
if len(blocks)<3: sys.exit('PREFLIGHT_FAIL=INLINE_SCRIPTS')
for i,block in enumerate(blocks):
 if not block.strip(): continue
 r=subprocess.run(['node','--check','-'],input=block,text=True,capture_output=True)
 if r.returncode: sys.exit('JS_SYNTAX_FAIL_BLOCK_'+str(i)+'='+r.stderr[:600])
backup=root/'academy-content'/('Q14_V2_BACKUP_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=False)
shutil.copy2(source,backup/'source_index.html');shutil.copy2(live,backup/'live_index.html')
tmp1=source.with_name('index.html.q14v2tmp');tmp2=live.with_name('index.html.q14v2tmp')
try:
 tmp1.write_text(s);tmp2.write_text(s)
 os.chmod(tmp1,0o644);os.chmod(tmp2,0o644)
 os.replace(tmp1,source);os.replace(tmp2,live)
 if source.read_bytes()!=live.read_bytes(): raise RuntimeError('SYNC_MISMATCH')
 print('Q14_V2_SOURCE_AND_LIVE=PASS');print('BACKUP='+str(backup));print('JS_SYNTAX=PASS');print('API_AND_DATABASE=UNCHANGED')
except Exception as exc:
 shutil.copy2(backup/'source_index.html',source);shutil.copy2(backup/'live_index.html',live)
 sys.exit('Q14_V2_ROLLED_BACK='+str(exc))
