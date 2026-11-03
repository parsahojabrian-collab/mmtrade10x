(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  var initData = tg && tg.initData ? tg.initData : '';

  var params = new URLSearchParams(window.location.search);

  // Staging runs only in explicit preview mode.
  // TENX_Q12_PUBLIC_RELEASE
// Public quiz interface enabled for all academy users.

  var academyMode =
    params.get('view') === 'academy' ||
    window.location.pathname === '/academy';

  if (!academyMode) return;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    if (className) node.className = className;
    return node;
  }

  function button(text, fn) {
    var b = el('button', text);
    b.type = 'button';
    b.style.cssText =
      'border:0;border-radius:12px;padding:12px 18px;' +
      'background:#b89152;color:#171717;font-weight:700;' +
      'cursor:pointer;margin-top:12px;width:100%';
    b.addEventListener('click', fn);
    return b;
  }

  function mount() {
    var target = document.getElementById('academy-managed-content');
    if (!target) return;

    if (document.getElementById('tenx-quiz-stage')) return;

    var root = el('section', '', 'tenx-quiz-staging');
    root.id = 'tenx-quiz-stage';
    root.dir = 'rtl';
    root.style.cssText =
      'margin:20px 0;padding:20px;border-radius:18px;' +
      'background:#171a22;color:#f7f7f7;' +
      'border:1px solid rgba(184,145,82,.4);' +
      'font-family:inherit';

    var title = el('h2', 'آزمون آکادمی 10X');
    title.style.margin = '0 0 12px';

    var note = el(
      'p',
      'آزمون رسمی آکادمی 10X؛ نتیجه پس از ثبت پاسخ‌ها نمایش داده می‌شود.'
    );
    note.style.cssText = 'font-size:13px;opacity:.8;line-height:1.9';

    var status = el('p', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var content = el('div');

    root.append(title, note, status, content);
    target.append(root);

    function message(text) {
      status.textContent = text;
    }

    async function post(path, data) {
      var response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ initData: initData }, data))
      });

      var body;
      try {
        body = await response.json();
      } catch (_) {
        throw new Error('پاسخ نامعتبر از سرور');
      }

      if (!response.ok) {
        var code = body && body.error;

        if (code === 'target_not_found') {
          throw new Error('این درس یا دوره هنوز منتشر نشده است.');
        }
        if (code === 'quiz_bank_incomplete') {
          throw new Error('بانک سؤال این آزمون هنوز فعال نشده است.');
        }
        if (code === 'attempt_limit') {
          throw new Error('محدودیت تعداد تلاش در ساعت فعال است.');
        }
        if (code === 'quiz_expired') {
          throw new Error('زمان آزمون به پایان رسیده است.');
        }
        if (code === 'already_submitted') {
          throw new Error('این آزمون قبلاً ثبت شده است.');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('احراز هویت معتبر تلگرام لازم است.');
        }

        throw new Error('خطای سرور: ' + (code || response.status));
      }

      return body;
    }

    var structure = [
      3,3,3,3,4,4,4,4,3,4,3,3,2,3,1,3
    ];

    function two(n) {
      return String(n).padStart(2, '0');
    }

    function renderStart() {
      content.replaceChildren();
      message('');

      var labelScope = el('p', 'نوع آزمون');
      var scopeSelect = document.createElement('select');
      var labelCourse = el('p', 'انتخاب دوره');
      var courseSelect = document.createElement('select');
      var labelLesson = el('p', 'انتخاب درس');
      var lessonSelect = document.createElement('select');

      [scopeSelect, courseSelect, lessonSelect].forEach(function (s) {
        s.style.cssText =
          'width:100%;padding:12px;border-radius:10px;' +
          'margin-bottom:8px;background:#292d36;color:white;' +
          'border:1px solid #646975';
      });

      [['lesson','آزمون درس'],['course','آزمون دوره']].forEach(
        function (entry) {
          var opt = new Option(entry[1], entry[0]);
          scopeSelect.add(opt);
        }
      );

      for (var c = 1; c <= 16; c++) {
        courseSelect.add(new Option('دوره ' + c, String(c)));
      }

      function refreshLessons() {
        lessonSelect.replaceChildren();
        var course = Number(courseSelect.value);
        for (var l = 1; l <= structure[course - 1]; l++) {
          lessonSelect.add(new Option('درس ' + l, String(l)));
        }
      }

      function refreshMode() {
        var show = scopeSelect.value === 'lesson';
        lessonSelect.hidden = !show;
        labelLesson.hidden = !show;
      }

      courseSelect.addEventListener('change', refreshLessons);
      scopeSelect.addEventListener('change', refreshMode);

      refreshLessons();
      refreshMode();

      content.append(
        labelScope, scopeSelect,
        labelCourse, courseSelect,
        labelLesson, lessonSelect
      );

      content.append(button('شروع آزمون', async function () {
        if (!initData) {
          message('این آزمون باید داخل تلگرام باز شود.');
          return;
        }

        var c = two(Number(courseSelect.value));
        var payload;

        if (scopeSelect.value === 'lesson') {
          var l = two(Number(lessonSelect.value));
          payload = { lessonId: 'tenx_q09_lesson_' + c + '_' + l };
        } else {
          payload = { courseId: 'tenx_q09_course_' + c };
        }

        message('در حال دریافت آزمون...');

        try {
          var result = await post('/academy/quizzes/start', payload);
          if (!result || !result.attemptId ||
              !Array.isArray(result.questions) ||
              result.questions.length !== (payload.lessonId ? 3 : 5)) {
            throw new Error('ساختار پاسخ آزمون معتبر نیست.');
          }
          renderQuiz(result);
        } catch (e) {
          message(e.message || 'خطا در شروع آزمون');
        }
      }));
    }

    function renderQuiz(data) {
      content.replaceChildren();
      message('حدنصاب قبولی: ' + data.passScore +
              ' از ' + data.questions.length);

      var selected = new Array(data.questions.length).fill(null);

      data.questions.forEach(function (q, i) {
        var box = el('fieldset');
        box.style.cssText =
          'border:1px solid #444;border-radius:12px;' +
          'padding:12px;margin:14px 0';

        var legend = el(
          'legend',
          'سؤال ' + (i + 1) + ': ' + q.prompt
        );
        box.append(legend);

        if (!Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error('گزینه‌های آزمون نامعتبر است.');
        }

        q.options.forEach(function (optionText, j) {
          var label = el('label');
          label.style.cssText =
            'display:block;padding:10px;cursor:pointer';

          var input = document.createElement('input');
          input.type = 'radio';
          input.name = 'tenx-q-' + i;
          input.value = String(j);
          input.style.marginLeft = '9px';
          input.addEventListener('change', function () {
            selected[i] = j;
          });

          label.append(input, document.createTextNode(String(optionText)));
          box.append(label);
        });

        content.append(box);
      });

      var submitButton = button('ثبت پاسخ‌ها', async function () {
        if (selected.some(function (x) { return x === null; })) {
          message('لطفاً به تمام سؤال‌ها پاسخ بده.');
          return;
        }

        submitButton.disabled = true;
        message('در حال ثبت پاسخ‌ها...');

        try {
          var result = await post('/academy/quizzes/submit', {
            attemptId: data.attemptId,
            answers: selected
          });
          renderResult(result);
        } catch (e) {
          message(e.message || 'ثبت آزمون ناموفق بود');
          submitButton.disabled = false;
        }
      });

      content.append(submitButton);
    }

    function renderResult(result) {
      content.replaceChildren();

      var heading = el(
        'h3',
        result.passed ? 'آزمون قبول شد' : 'آزمون قبول نشد'
      );
      var detail = el(
        'p',
        'نمره: ' + result.score + ' از ' + result.total +
        ' | حدنصاب: ' + result.passScore
      );

      content.append(heading, detail);
      content.append(button('بازگشت به انتخاب آزمون', renderStart));
      message('نتیجه آزمون ثبت شد.');
    }

    renderStart();
  }

  ready(mount);
})();
