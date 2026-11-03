(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  var initData = tg && tg.initData;
  if (!initData) return;

  var currentUser = null;
  var backdrop = null;
  var selectedLevel = '';
  var isFirstTime = false;
  var firstNameInput = null;
  var lastNameInput = null;

  var labels = {
    BEGINNER: 'مبتدی',
    INTERMEDIATE: 'متوسط',
    PROFESSIONAL: 'حرفه‌ای'
  };

  function request(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ initData: initData }, payload || {}))
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.error || 'request_failed');
        return data;
      });
    });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function close() {
    if (backdrop) backdrop.remove();
    backdrop = null;
    document.body.style.overflow = '';
  }

  function open(editOnly) {
    if (!currentUser || backdrop) return;

    isFirstTime = !currentUser.profileCompletedAt;
    selectedLevel = currentUser.tradingLevel || '';

    backdrop = element('div', 'tenx-onboard-backdrop');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'تکمیل پروفایل 10X');

    var sheet = element('section', 'tenx-onboard-sheet');
    var brand = element('div', 'tenx-onboard-brand', '10X ACADEMY');
    var symbol = element('div', 'tenx-onboard-symbol', '10X');
    var title = element(
      'h2', '',
      isFirstTime ? 'مسیر 10X تو از اینجا شروع می‌شه' : 'سطح معاملاتی من'
    );
    var subtitle = element(
      'p', 'tenx-onboard-subtitle',
      isFirstTime
        ? 'برای ساختن مسیر آموزشی مخصوص خودت، چند اطلاعات کوتاه لازمه.'
        : 'سطحت رو تغییر بده تا پیشنهادهای آموزشی متناسب‌تری دریافت کنی.'
    );

    sheet.append(brand, symbol, title, subtitle);

    var step = 1;
    var form = element('div');
    var error = element('p', 'tenx-onboard-error');
    error.setAttribute('role', 'alert');

    var submit = element('button', 'tenx-onboard-submit');
    submit.type = 'button';

    var back = element('button', 'tenx-onboard-secondary', 'مرحله قبل');
    back.type = 'button';

    var choices = [
      ['BEGINNER', '🌱', 'مبتدی', 'تازه وارد دنیای معامله‌گری شدم'],
      ['INTERMEDIATE', '📈', 'متوسط', 'با مفاهیم و معاملات آشنایی دارم'],
      ['PROFESSIONAL', '💎', 'حرفه‌ای', 'تجربه عملی و استراتژی معاملاتی دارم']
    ];

    function render() {
      form.replaceChildren();
      error.textContent = '';

      if (isFirstTime && step === 1) {
        var f = element('label', 'tenx-onboard-field', 'نام');
        firstNameInput = element('input');
        firstNameInput.type = 'text';
        firstNameInput.maxLength = 80;
        firstNameInput.autocomplete = 'given-name';
        firstNameInput.value = currentUser.firstName || '';
        f.append(firstNameInput);

        var l = element('label', 'tenx-onboard-field', 'نام خانوادگی');
        lastNameInput = element('input');
        lastNameInput.type = 'text';
        lastNameInput.maxLength = 80;
        lastNameInput.autocomplete = 'family-name';
        lastNameInput.value = currentUser.lastName || '';
        l.append(lastNameInput);

        form.append(f, l);
        submit.textContent = 'ادامه مسیر ←';
      } else {
        choices.forEach(function (choice) {
          var button = element('button', 'tenx-onboard-level');
          button.type = 'button';
          button.setAttribute('aria-pressed', String(selectedLevel === choice[0]));

          var icon = element('span', 'tenx-onboard-level-icon', choice[1]);
          var info = element('span');
          info.append(
            element('strong', '', choice[2]),
            element('small', '', choice[3])
          );
          button.append(icon, info);

          button.onclick = function () {
            selectedLevel = choice[0];
            form.querySelectorAll('.tenx-onboard-level').forEach(function (b) {
              b.setAttribute('aria-pressed', String(b === button));
            });
          };
          form.append(button);
        });
        submit.textContent = 'تأیید و ذخیره اطلاعات';
      }

      back.hidden = !(isFirstTime && step === 2);
    }

    var savedFirst = '';
    var savedLast = '';

    submit.onclick = function () {
      error.textContent = '';

      if (isFirstTime && step === 1) {
        savedFirst = firstNameInput.value.trim();
        savedLast = lastNameInput.value.trim();

        if (savedFirst.length < 2 || savedLast.length < 2) {
          error.textContent = 'نام و نام خانوادگی باید حداقل ۲ حرف داشته باشند.';
          return;
        }

        step = 2;
        render();
        return;
      }

      if (!selectedLevel) {
        error.textContent = 'لطفاً سطح معاملاتی خودت رو انتخاب کن.';
        return;
      }

      submit.disabled = true;
      submit.textContent = 'در حال ذخیره...';

      var payload = { tradingLevel: selectedLevel };
      if (isFirstTime) {
        payload.firstName = savedFirst;
        payload.lastName = savedLast;
      }

      request('/miniapp/profile/save', payload)
        .then(function (result) {
          currentUser = Object.assign({}, currentUser, result.user);
          close();
          if (isFirstTime) {
            window.location.reload();
          } else {
            updateEditButton();
          }
        })
        .catch(function (err) {
          error.textContent =
            err.message === 'phone_registration_required'
              ? 'ابتدا ثبت‌نام و تأیید شماره را در ربات تکمیل کن.'
              : 'ذخیره اطلاعات انجام نشد. دوباره تلاش کن.';
          submit.disabled = false;
          submit.textContent = 'تلاش دوباره';
        });
    };

    back.onclick = function () {
      step = 1;
      render();
    };

    sheet.append(form, error, submit, back);

    if (editOnly && !isFirstTime) {
      var cancel = element('button', 'tenx-onboard-secondary', 'انصراف');
      cancel.type = 'button';
      cancel.onclick = close;
      sheet.append(cancel);
    }

    backdrop.append(sheet);
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    render();
  }

  function updateEditButton() {
    var path = location.pathname.replace(/\/+$/, '');
    if (path !== '/profile') return;

    var root = document.getElementById('profile-data');
    if (!root || !currentUser || !currentUser.profileCompletedAt) return;

    var button = document.getElementById('tenx-edit-trading-level');
    if (!button) {
      button = element('button', 'tenx-edit-level');
      button.id = 'tenx-edit-trading-level';
      button.type = 'button';
      button.onclick = function () { open(true); };
    }

    button.textContent = 'سطح معاملاتی: ' +
      (labels[currentUser.tradingLevel] || 'تعیین‌نشده') +
      ' · ویرایش';

    if (!root.contains(button)) root.prepend(button);
  }

  function ready() {
    request('/auth/telegram')
      .then(function (auth) {
        if (!auth.user) return;
        currentUser = auth.user;

        if (!currentUser.phone ||
            !['REGISTERED', 'COMPLETE'].includes(currentUser.registrationStatus)) {
          return;
        }

        if (!currentUser.profileCompletedAt) {
          open(false);
        } else {
          updateEditButton();
          var root = document.getElementById('profile-data');
          if (root) {
            var observer = new MutationObserver(function () {
              if (!document.getElementById('tenx-edit-trading-level')) {
                updateEditButton();
              }
            });
            observer.observe(root, { childList: true });
          }
        }
      })
      .catch(function (err) {
        console.warn('10X profile onboarding unavailable:', err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready, { once: true });
  } else {
    ready();
  }
})();
